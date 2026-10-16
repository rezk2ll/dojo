const SPRING = 'https://github.com/spring-projects/spring-framework';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'leaked-handle',
	part: 'Les ressources',
	title: 'Le close qu’un throw saute',
	minutes: 10,
	hook: [
		'Spring JDBC fournit `MySQLMaxValueIncrementer`, qui distribue des identifiants à partir d’une table compteur dans MySQL. Par défaut, il prend une **connexion à part** dans la `DataSource` pour chaque mise à jour du compteur, fait un commit, puis ferme cette connexion.',
		'Quand le commit échoue, l’appelant reçoit une `DataAccessResourceFailureException` avec "Unable to commit new sequence value changes". Le code a un bloc `finally` censé tout nettoyer, quel que soit le chemin. Sur ce chemin-là, la connexion **reste ouverte**.'
	],
	terms: [
		{ term: 'DataSource', def: 'L’objet Java qui distribue les connexions à la base. C’est souvent un pool qui en réutilise un nombre fixe.' },
		{ term: 'finally', def: 'Un bloc Java qui s’exécute après `try` et `catch`, qu’ils se terminent normalement ou en lançant une exception.' },
		{ term: 'Auto-commit', def: 'Un mode de connexion où chaque requête est validée seule. L’incrémenteur le coupe pour faire le commit à la main.' }
	],
	bug: {
		title: 'Fix connection leak in MySQLMaxValueIncrementer',
		repo: 'spring-projects/spring-framework',
		url: `${SPRING}/blob/f03b76a53dfd87e53db0c4c72f37e2a87c94f7c2/spring-jdbc/src/main/java/org/springframework/jdbc/support/incrementer/MySQLMaxValueIncrementer.java#L127-L191`,
		fix: `${SPRING}/commit/5e45b9be1b742c7493e2bafbb0f1d1d0828194e3`,
		lang: 'java',
		code: `Connection con = null;
Statement stmt = null;
boolean mustRestoreAutoCommit = false;
try {
    if (this.useNewConnection) {
        con = getDataSource().getConnection();
        if (con.getAutoCommit()) {
            mustRestoreAutoCommit = true;
            con.setAutoCommit(false);
        }
    }
…
    this.nextId = this.maxId - getCacheSize() + 1;
}
catch (SQLException ex) {
    throw new DataAccessResourceFailureException("Could not obtain last_insert_id()", ex);
}
finally {
    JdbcUtils.closeStatement(stmt);
    if (con != null) {
        if (this.useNewConnection) {
            try {
                con.commit();
                if (mustRestoreAutoCommit) {
                    con.setAutoCommit(true);
                }
            }
            catch (SQLException ignore) {
                throw new DataAccessResourceFailureException(
                        "Unable to commit new sequence value changes for " + getIncrementerName());
            }
            JdbcUtils.closeConnection(con);
        }
        else {
            DataSourceUtils.releaseConnection(con, getDataSource());
        }
    }
}`,
		lines: [32],
		diff: `                         catch (SQLException ignore) {
                             throw new DataAccessResourceFailureException(
                                     "Unable to commit new sequence value changes for " + getIncrementerName());
                         }
-                        JdbcUtils.closeConnection(con);
+                        finally {
+                            JdbcUtils.closeConnection(con);
+                        }
                     }`,
		notes: [
			'**Un throw au milieu du nettoyage.** Le `finally` extérieur s’exécute sur tous les chemins, mais il contient son propre `catch` qui lance une exception. Quand `con.commit()` ou `con.setAutoCommit(true)` échoue, ce `throw` sort tout de suite du bloc `finally`. `JdbcUtils.closeConnection(con)` est la ligne d’après : elle ne s’exécute jamais.',
			'**Ce que ça coûte.** La connexion vient de `getDataSource().getConnection()` et plus personne ne la tient. Si la `DataSource` est un pool de 10 connexions, 10 commits ratés les laissent toutes les 10 empruntées, et l’appelant suivant attend une connexion qui ne revient jamais.',
			'**Le correctif.** Un `finally` sur le `try` intérieur met la fermeture sur tous les chemins de sortie, y compris le `throw` du `catch`. L’exception arrive toujours à l’appelant, après la fermeture de la connexion.',
			'**Comment ça a été trouvé.** [La pull request #37321](' + SPRING + '/pull/37321) l’explique : "the exception handler throws a `DataAccessResourceFailureException` before reaching `Connection.close()`." Le message du commit : "Move connection cleanup into a finally block so the connection is closed even if commit or auto-commit restoration fails."'
		]
	},
	quiz: [
		{
			q: '`con.commit()` lance une `SQLException`. Laquelle de ces lignes s’exécute encore dans le code bogué ?',
			options: [
				'`JdbcUtils.closeConnection(con)`, à la fin du bloc',
				'`JdbcUtils.closeStatement(stmt)`, en haut du `finally`',
				'`con.setAutoCommit(true)`, pour remettre le réglage',
				'`DataSourceUtils.releaseConnection(con, ...)` dans le `else`'
			],
			answer: 1,
			why: '`closeStatement` s’exécute avant le commit. Le `catch` lance ensuite une exception, ce qui saute `closeConnection`. Les lignes `setAutoCommit` et `else` ne sont pas atteintes non plus.'
		},
		{
			q: 'La `DataSource` est un pool de 10 connexions. Que se passe-t-il après 10 commits ratés ?',
			options: [
				'Le pool ferme les 10 connexions et en ouvre de nouvelles',
				'Les 10 restent empruntées et l’appelant suivant attend',
				'MySQL annule et les connexions reviennent dans le pool',
				'Rien, puisque `getNextKey` est `synchronized`'
			],
			answer: 1,
			why: 'Un pool ne récupère une connexion que quand on appelle `close` dessus. Aucune des 10 n’a été fermée, donc le pool n’a plus rien à donner.'
		},
		{
			q: 'Quel test montre cette fuite ?',
			options: [
				'Appeler `getNextKey` de nombreuses fois avec une base qui marche',
				'Faire échouer `commit()`, puis vérifier que `close()` a été appelé',
				'Mettre `useNewConnection` à false et appeler `getNextKey`',
				'Appeler `getNextKey` depuis deux threads en même temps'
			],
			answer: 1,
			why: 'La fuite n’arrive que sur le chemin d’échec. Une connexion simulée dont `commit` lance une exception, et une vérification que `close` a quand même été appelé, la couvrent.'
		}
	],
	takeaway: 'Regarde dans chaque bloc `finally` s’il y a du code qui peut lancer une exception avant le dernier appel de nettoyage. Mets chaque nettoyage dans son propre `finally`, ou utilise try-with-resources, pour qu’une exception plus haut dans le bloc ne puisse pas le sauter.',
	sources: [
		{ title: 'spring-framework, pull request #37321', url: `${SPRING}/pull/37321` },
		{ title: 'Le commit du correctif', url: `${SPRING}/commit/5e45b9be1b742c7493e2bafbb0f1d1d0828194e3` }
	]
};
