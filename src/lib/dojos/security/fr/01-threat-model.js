const DJ = 'https://github.com/django/django/blob/d430084791a61b31cecec132bce3dca19194f7f2';
const FORMS = `${DJ}/django/contrib/auth/forms.py`;
const TOKENS = `${DJ}/django/contrib/auth/tokens.py`;
const VIEWS = `${DJ}/django/contrib/auth/views.py`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'threat-model',
	part: 'Les menaces',
	title: 'Modéliser les menaces d’une fonctionnalité',
	minutes: 10,
	hook: [
		'Le 11 janvier 2024, GitLab publie 7 versions correctives, de 16.1.6 à 16.7.2, pour la CVE-2023-7028, notée 10.0 sur 10. L’avis : « user account password reset emails could be delivered to an unverified email address ». Un attaquant qui demandait une réinitialisation pour ton compte pouvait recevoir le lien et choisir un nouveau mot de passe.',
		'GitLab explique aux admins quoi chercher dans leurs logs : des requêtes vers `/users/password` dont le paramètre `email` est un tableau JSON de plusieurs adresses. Le bug est arrivé avec la 16.1.0, le 1er mai 2023 : il est resté en ligne huit mois. Sur les comptes avec double authentification, l’attaquant pouvait changer le mot de passe mais pas se connecter.',
		'Un chercheur l’a signalé via le programme de bug bounty de GitLab. La question qui l’aurait trouvé tient en une ligne : qui choisit l’adresse qui reçoit le lien ? Un **modèle de menaces** pose ce genre de questions exprès, dès la conception. Plus bas, tu en fais un pour une fonction « mot de passe oublié », avec STRIDE comme liste de contrôle.'
	],
	terms: [
		{ term: 'Modèle de menaces', def: 'La réponse écrite à quatre questions sur un système : sur quoi travaille-t-on, qu’est-ce qui peut mal tourner, que fait-on contre, et a-t-on fait assez bien.' },
		{ term: 'Diagramme de flux de données', def: 'Un dessin des processus, des stockages, des acteurs externes et des flux de données d’une fonctionnalité. Tu le parcours case par case pour chercher ce qui peut mal tourner.' },
		{ term: 'STRIDE', def: 'Six questions, une par lettre : Spoofing (usurpation), Tampering (altération), Repudiation (répudiation), Information disclosure (fuite d’information), Denial of service (déni de service), Elevation of privilege (élévation de privilèges). Tu poses chacune à chaque case et chaque flèche du diagramme.' },
		{ term: 'Jeton de réinitialisation', def: 'La chaîne secrète dans le lien du mail de réinitialisation. Qui la détient peut choisir un nouveau mot de passe pour le compte.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['u["Navigateur : POST /password_reset email=ana@example.com"] --> app["Appli : cherche le compte"]', 'app --> db[("table users")]', 'app --> mail["Serveur mail : envoie le lien avec un jeton"]'],
				highlight: ['u', 'app', 'db', 'mail'],
				note: 'Commence par dessiner la fonction. Le navigateur envoie une adresse mail, l’appli la cherche dans la table `users`, et le serveur mail envoie un lien avec un jeton. Sur chaque flèche, tu poseras les six questions STRIDE.'
			},
			{
				add: ['atk["Attaquant : email=[ana@example.com, me@evil.test]"] -.->|"S : usurpation"| app'],
				highlight: ['atk'],
				note: 'Usurpation : quelqu’un peut-il recevoir le lien d’un compte qui n’est pas le sien ? GitLab 16.1 à 16.7.1 pouvait envoyer le lien à une adresse non vérifiée, et ses conseils de recherche dans les logs visent les requêtes avec une liste d’adresses. La parade : **envoyer uniquement à l’adresse enregistrée sur le compte**, jamais à celle reçue par le formulaire.'
			},
			{
				add: ['app -.->|"I : aucun compte avec cette adresse"| atk'],
				highlight: ['app'],
				note: 'Fuite d’information : la réponse change-t-elle quand le compte n’existe pas ? Une page qui affiche « aucun compte avec cette adresse » permet à n’importe qui de tester une liste d’adresses. L’OWASP demande « a consistent message for both existent and non-existent accounts », renvoyé dans le même temps.'
			},
			{
				add: ['tok["Jeton : aléatoire, à usage unique, expire"] --> mail'],
				highlight: ['tok'],
				note: 'Usurpation par le jeton : peut-on le deviner ou le réutiliser ? L’OWASP donne les règles : tiré par un générateur aléatoire cryptographique, assez long contre la force brute, lié à un seul utilisateur, et invalidé après usage.'
			},
			{
				add: ['flood["Des milliers de demandes par heure pour ana"] -.->|"D : déni de service"| mail'],
				highlight: ['flood'],
				note: 'Déni de service : peut-on noyer un utilisateur sous les mails ou bloquer son compte ? L’OWASP demande une limite de débit par compte, et ajoute qu’un compte « should not be locked out in response to a forgotten password attack ».'
			},
			{
				add: ['app --> log[("Journal d’audit : qui a demandé, pour quel compte")]'],
				highlight: ['log'],
				note: 'Répudiation : pourras-tu prouver plus tard ce qui s’est passé ? GitLab a pu dire aux admins de chercher dans `audit_json.log` les entrées `PasswordsController#create` avec plusieurs adresses, parce que le journal d’audit gardait chaque demande et ses adresses cibles.'
			}
		]
	},
	example: {
		title: 'django/contrib/auth/forms.py : PasswordResetForm trouve les comptes et écrit à l’adresse enregistrée',
		repo: 'django/django',
		url: `${FORMS}#L423-L488`,
		lang: 'python',
		code: `    def get_users(self, email):
        """Given an email, return matching user(s) who should receive a reset.

        This allows subclasses to more easily customize the default policies
        that prevent inactive users and users with unusable passwords from
        resetting their password.
        """
        email_field_name = UserModel.get_email_field_name()
        active_users = UserModel._default_manager.filter(
            **{
                "%s__iexact" % email_field_name: email,
                "is_active": True,
            }
        )
        return (
            u
            for u in active_users
            if u.has_usable_password()
            and _unicode_ci_compare(email, getattr(u, email_field_name))
        )
…
        email = self.cleaned_data["email"]
…
        email_field_name = UserModel.get_email_field_name()
        for user in self.get_users(email):
            user_email = getattr(user, email_field_name)
            user_pk_bytes = force_bytes(UserModel._meta.pk.value_to_string(user))
            context = {
                "email": user_email,
                "domain": domain,
                "site_name": site_name,
                "uid": urlsafe_base64_encode(user_pk_bytes),
                "user": user,
                "token": token_generator.make_token(user),
                "protocol": "https" if use_https else "http",
                **(extra_email_context or {}),
            }
            self.send_mail(
                subject_template_name,
                email_template_name,
                context,
                from_email,
                user_email,
                html_email_template_name=html_email_template_name,
            )`,
		notes: [
			'La ligne `user_email = getattr(user, email_field_name)` lit l’adresse dans la ligne de la base, et `send_mail` reçoit `user_email`. Le champ `email` du formulaire sert seulement à chercher : c’est la réponse à la question d’usurpation de l’étape 2.',
			'Django a appris ça avec la CVE-2019-19844, corrigée le 18 décembre 2019. Une adresse fabriquée pouvait tomber sur un vrai compte après la mise en minuscules Unicode. Le correctif ajoute `_unicode_ci_compare`, qui normalise les deux chaînes en NFKC puis applique `casefold()`, et l’avis précise que Django « now sends to the email address retrieved from the database ».',
			'Le filtre ne garde que les comptes `is_active: True` avec `has_usable_password()`. Si personne ne correspond, la boucle n’envoie rien, et [`PasswordResetView.form_valid`](' + VIEWS + '#L231-L243) redirige quand même vers la même page « done ». Le visiteur voit la même réponse, que le compte existe ou non.',
			'`token_generator.make_token(user)` signe un horodatage et [une valeur](' + TOKENS + '#L98-L122) construite avec l’id du compte, le hash du mot de passe, la date de dernière connexion et l’adresse. Un nouveau mot de passe change le hash, donc un lien déjà utilisé ne marche plus. `check_token` refuse aussi les liens plus vieux que `PASSWORD_RESET_TIMEOUT`, 259200 secondes (3 jours) par défaut.'
		]
	},
	tradeoff: {
		gain: [
			'Un diagramme de 4 cases et les 6 questions STRIDE donnent une liste de questions précises, comme « qui choisit l’adresse du destinataire ? », celle à laquelle la CVE-2023-7028 répondait mal.',
			'Chaque réponse donne une exigence testable : même réponse pour une adresse inconnue, envoi seulement à l’adresse enregistrée, jeton expiré au bout de 3 jours.'
		],
		cost: [
			'STRIDE trouve des menaces mais ne les classe pas. L’OWASP propose probabilité fois impact, et reconnaît que les deux « can be challenging to calculate ».',
			'Le modèle ne vaut que pour la version que tu as dessinée. Le bug de GitLab est arrivé avec la 16.1.0 : il faut refaire le modèle quand le code de réinitialisation change.',
			'Une séance prend une heure à des gens qui connaissent la fonction. Les questions aident moins si personne dans la salle n’a déjà vu ce genre d’attaque.'
		]
	},
	task: {
		prompt: 'Un handler Flask de réinitialisation fait cinq choses dans l’ordre. (1) `user = db.find_user(email=request.form["email"])`. (2) `if not user: return "No account with that email", 404`. (3) `token = str(random.randint(100000, 999999))`, enregistré sans expiration. (4) `send_mail(to=request.form["email"], link=f"https://{request.host}/reset?t={token}")`. (5) `return "Email sent"`. Passe-le au crible de STRIDE et note chaque problème avec sa lettre.',
		hint: 'Pour chaque valeur, demande-toi qui la contrôle. Regarde le 404, le module `random`, l’argument `to=` et `request.host`.',
		answer: [
			'I : le 404 avec « No account with that email » dit à n’importe qui quelles adresses ont un compte. Réponds « Email sent » dans tous les cas, dans le même temps.',
			'S : le jeton fait 6 chiffres tirés par `random`, soit 900 000 valeurs, et la doc Python dit que `random` « should not be used for security purposes ». À 100 essais par seconde, tout est essayé en 9 000 secondes, 2 h 30. Utilise `secrets.token_urlsafe(32)`, stocke-le haché, fais-le expirer et supprime-le après usage.',
			'S : `to=email` écrit à l’adresse tapée par le visiteur. Avec une recherche insensible à la casse, une adresse sosie peut tomber sur le compte et recevoir le lien, comme dans la CVE-2019-19844 de Django. Écris à `user.email`.',
			'S : `request.host` vient de l’en-tête `Host`, que l’attaquant choisit. Le lien peut pointer vers son serveur et lui livrer le jeton au clic de la victime. L’OWASP : l’URL « should either be hard-coded, or validated against a list of trusted domains ».',
			'D et R : rien ne limite les demandes par compte, et rien n’est journalisé. Ajoute une limite par compte et journalise chaque demande avec le compte visé.'
		],
		steps: [
			{
				title: 'Trouve qui contrôle chaque valeur',
				questions: [
					{ q: 'Dans (4), qui choisit l’adresse de `to=` ?', options: ['La table `users`', 'Le serveur de mail', 'Celui qui envoie la requête', 'La configuration de l’app'], answer: 2, why: '`request.form["email"]` est ce que le navigateur a posté. Celui qui envoie la requête le choisit.' },
					{ q: 'D’où vient `request.host` ?', options: ['De l’en-tête `Host`, que l’expéditeur choisit', 'Du nom du serveur dans la config de l’app', 'Du certificat TLS du site', 'De l’enregistrement DNS du domaine'], answer: 0, why: 'Il est lu dans l’en-tête `Host` de la requête. L’attaquant peut y mettre n’importe quelle valeur.' },
					{ q: 'Comment appliques-tu STRIDE à ce handler ?', options: ['Classe chaque ligne par probabilité fois impact', 'Choisis la lettre qui colle le mieux à la fonctionnalité', 'Passe-le une fois sur toute l’app, pas par fonctionnalité', 'Pose les six questions à chaque étape et chaque flèche'], answer: 3, why: 'STRIDE, ce sont six questions, et tu poses chacune à chaque case et chaque flèche. Il trouve des menaces ; il ne les classe pas.' },
					{ q: 'Que demande la lettre R à ce handler ?', options: ['Quelqu’un peut-il lire des données interdites ?', 'Peux-tu prouver plus tard qui a demandé quel compte ?', 'Quelqu’un peut-il devenir admin par le formulaire ?', 'Quelqu’un peut-il modifier le jeton après l’envoi ?'], answer: 1, why: 'La répudiation, c’est la preuve après coup. GitLab a pu dire aux admins quoi chercher parce que son journal d’audit enregistrait chaque demande de réinitialisation.' }
				]
			},
			{
				title: 'Vérifie les réponses et le jeton',
				questions: [
					{ q: '(2) répond « No account with that email » avec un 404. Quelle lettre ?', options: ['Spoofing', 'Tampering', 'Information disclosure', 'Denial of service'], answer: 2, why: 'Chaque requête livre un fait : cette adresse a-t-elle un compte. N’importe qui peut tester une liste d’adresses.' },
					{ q: 'Que renvoies-tu à la place ?', options: ['« Email sent » dans tous les cas, dans le même temps', 'Un 403 au lieu d’un 404 pour les adresses inconnues', 'Le même message, mais après un CAPTCHA', 'Un 404 avec un corps vide'], answer: 0, why: 'L’OWASP demande un message identique pour les comptes existants et absents, dans le même temps. Un autre code de statut ou une réponse plus lente fuit encore.' },
					{ q: 'Combien de jetons `random.randint(100000, 999999)` peut-il produire ?', options: ['999 999', '900 000', '1 000 000', '100 000'], answer: 1, why: 'De 100000 à 999999, il y a 900 000 valeurs, toutes à 6 chiffres.' },
					{ q: 'À 100 essais par seconde, combien de temps pour tous les essayer ?', options: ['Environ 15 minutes', 'Environ 25 heures', 'Environ 9 jours', 'Environ 2 h 30'], answer: 3, why: '900 000 valeurs à 100 par seconde, c’est 9 000 secondes, 2 h 30. Sans expiration, le jeton attend tout ce temps.' }
				]
			},
			{
				title: 'Regarde où part le lien',
				questions: [
					{ q: '(4) écrit à `request.form["email"]`, et la recherche ignore la casse. Qu’est-ce qui peut mal tourner ?', options: ['Le serveur de mail refuse les majuscules', 'Une adresse sosie tombe sur le compte et reçoit le lien', 'Le jeton est enregistré pour le mauvais compte', 'Le mail part avant que le jeton soit enregistré'], answer: 1, why: 'C’est la CVE-2019-19844 de Django : une adresse fabriquée tombait sur un vrai compte après le pliage de casse Unicode, et le lien partait chez l’attaquant.' },
					{ q: 'À quelle adresse le lien doit-il partir ?', options: ['À l’adresse tapée, passée en minuscules', 'À l’adresse tapée et à l’adresse enregistrée', 'À une adresse que l’utilisateur confirme sur la page', 'À `user.email`, lue dans la ligne de la base'], answer: 3, why: 'Seule l’adresse enregistrée appartient au titulaire. La CVE-2023-7028 de GitLab envoyait les liens à des adresses prises dans la requête.' },
					{ q: 'Un attaquant poste l’adresse d’ana avec `Host: evil.example`. Que reçoit ana ?', options: ['Un vrai jeton dans un lien vers evil.example', 'Une erreur, car l’hôte ne correspond pas', 'Un lien vers le vrai site, sans jeton', 'Aucun mail, car l’hôte est inconnu'], answer: 0, why: 'Le lien est construit avec `request.host`. Quand ana clique, son navigateur livre un jeton valide au serveur de l’attaquant.' },
					{ q: 'Que dit l’OWASP sur l’URL de réinitialisation ?', options: ['Construis-la avec l’en-tête `Referer`', 'Construis-la avec l’hôte de la requête, en HTTPS', 'Écris-la en dur, ou vérifie-la contre des domaines de confiance', 'Laisse l’utilisateur la choisir dans le formulaire'], answer: 2, why: 'L’OWASP : l’URL « should either be hard-coded, or validated against a list of trusted domains ». L’en-tête `Host` n’est ni l’un ni l’autre.' }
				]
			},
			{
				title: 'Bouche les trous',
				questions: [
					{ q: 'Après les corrections de I et S, quelles lettres le handler rate-t-il encore ?', options: ['D et R', 'T et E', 'Seulement T', 'Aucune'], answer: 0, why: 'Rien ne limite les demandes par compte (D), et rien n’est journalisé (R).' },
					{ q: 'Quelqu’un envoie des milliers de demandes par heure pour ana. Qu’ajoutes-tu ?', options: ['Bloquer le compte d’ana après 5 demandes', 'Un jeton plus long dans chaque mail', 'Une limite de débit par compte', 'Un second serveur de mail pour les liens'], answer: 2, why: 'L’OWASP demande une limite par compte, et dit que les comptes ne doivent pas être bloqués par une attaque sur le mot de passe oublié.' },
					{ q: 'Que doit contenir chaque entrée du journal ?', options: ['Le jeton, pour que le support le renvoie', 'Le nouveau mot de passe, pour le support', 'Seulement l’heure de la demande', 'Qui a demandé, et pour quel compte'], answer: 3, why: 'C’est ce qui a permis à GitLab de montrer aux admins les requêtes suspectes. Ne journalise jamais le jeton : qui le détient choisit le mot de passe.' },
					{ q: 'Quel jeton respecte les règles de l’OWASP ?', options: ['`random.randint` sur 12 chiffres, sans expiration', '`secrets.token_urlsafe(32)`, haché, qui expire, à usage unique', '`secrets.token_urlsafe(32)`, valable jusqu’à la connexion suivante', 'Un SHA-256 de l’adresse et de la date du jour'], answer: 1, why: 'L’OWASP : un générateur aléatoire sûr, assez long, lié à un seul compte, invalidé après usage. La doc Python dit que `random` « should not be used for security purposes ».' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Quel changement dans un formulaire de réinitialisation bloque l’attaque de la CVE-2023-7028 de GitLab ?',
			options: [
				'Envoyer le lien seulement à l’adresse enregistrée sur le compte',
				'Ajouter un CAPTCHA au formulaire contre les requêtes scriptées',
				'Passer le jeton de réinitialisation de 32 à 64 caractères',
				'Bloquer le compte après 5 demandes de réinitialisation en une heure'
			],
			answer: 0,
			why: 'L’attaquant ne devinait rien : GitLab envoyait un lien valide à une adresse qu’il fournissait. Un CAPTCHA ou un jeton plus long lui envoient toujours ce lien. Lire le destinataire dans la ligne du compte, comme Django avec `getattr(user, email_field_name)`, ferme le trou.'
		},
		{
			q: 'Ta page de réinitialisation répond « aucun compte avec cette adresse » pour une adresse inconnue. Quelle lettre de STRIDE ?',
			options: ['Usurpation (Spoofing)', 'Altération (Tampering)', 'Fuite d’information', 'Élévation de privilèges'],
			answer: 2,
			why: 'La page révèle un fait par requête : cette adresse a-t-elle un compte ? Un attaquant teste une liste d’adresses puis vise celles qui existent. Renvoie le même message, dans le même temps, dans les deux cas.'
		},
		{
			q: 'Pourquoi Django met-il `user.password` (le hash stocké) dans le calcul du jeton ?',
			options: [
				'Pour pouvoir redéchiffrer le jeton en mot de passe en cas de besoin',
				'Pour que le jeton cesse de marcher dès que le mot de passe change',
				'Pour que le jeton ne serve plus une fois passés les 3 jours',
				'Pour que le jeton soit différent sur chaque serveur du cluster'
			],
			answer: 1,
			why: 'Un nouveau mot de passe écrit un nouveau hash salé, donc le HMAC recalculé par `check_token` ne correspond plus à l’ancien lien. Le lien est à usage unique sans table de jetons utilisés. La limite de 3 jours vient de l’horodatage et de `PASSWORD_RESET_TIMEOUT`.'
		}
	],
	lab: {
		minutes: 25,
		goal: 'Lancer le handler de réinitialisation de l’exercice sur ton portable, le passer au crible de STRIDE, et prouver trois des problèmes avec `curl`.',
		steps: [
			'Écris le handler dans un dossier de travail. Il affiche le mail au lieu de l’envoyer : `mkdir -p ~/threat-lab && cd ~/threat-lab && printf \'%s\\n\' \'import random\' \'from flask import Flask, request\' \'app = Flask(__name__)\' \'USERS = {"ana@example.com"}\' \'@app.post("/reset")\' \'def reset():\' \'    email = request.form["email"]\' \'    if email not in USERS:\' \'        return "No account with that email", 404\' \'    token = str(random.randint(100000, 999999))\' \'    print(f"MAIL to={email} link=http://{request.host}/reset?t={token}", flush=True)\' \'    return "Email sent"\' \'app.run(host="0.0.0.0", port=5000)\' > app.py`.',
			'Lance-le dans un conteneur : `docker run -d --name threat-lab -p 127.0.0.1:5050:5000 -v "$PWD":/app -w /app python:3.12-alpine sh -c \'pip install -q flask==3.1.0 && python app.py\'`. Attends que `docker logs threat-lab` affiche `Running on`.',
			'Dessine le flux dans `threats.md` : le navigateur, l’appli, l’ensemble `USERS`, la ligne du mail. Pose les six questions STRIDE à chaque flèche, et écris une ligne par menace avec sa lettre.',
			'Teste le problème I : `curl -s -w \' %{http_code}\\n\' -d email=ana@example.com localhost:5050/reset`, puis la même chose avec `nobody@example.com`.',
			'Teste le problème S sur le lien : `curl -s -d email=ana@example.com -H \'Host: evil.example\' localhost:5050/reset`, puis `docker logs threat-lab 2>/dev/null | grep MAIL`.',
			'Teste le problème D : `for i in $(seq 20); do curl -s -o /dev/null -d email=ana@example.com localhost:5050/reset; done`, puis `docker logs threat-lab 2>/dev/null | grep -c MAIL`. Copie `threats.md` ailleurs si tu veux le garder, puis nettoie avec `docker rm -f threat-lab && rm -rf ~/threat-lab`.'
		],
		done: [
			'ana reçoit `Email sent 200`, et nobody reçoit `No account with that email 404`.',
			'La ligne de log de la requête `evil.example` contient `link=http://evil.example/reset?t=` suivi de six chiffres.',
			'Après la boucle, `grep -c MAIL` affiche `22` : chaque requête a envoyé un mail, et aucune n’a été refusée.',
			'`threats.md` a au moins cinq lignes, et elles couvrent I, S, D et R.'
		],
		solution: [
			'I : le code de statut et le corps changent selon le compte, donc une liste d’adresses te dit qui en a un. Réponds `Email sent` avec un 200 dans tous les cas.',
			'S : le jeton fait 6 chiffres tirés par `random`, le mail part à `request.form["email"]`, et le lien est construit à partir de l’en-tête `Host` que tu viens de choisir. Les parades : `secrets.token_urlsafe(32)` stocké haché avec une expiration, l’adresse enregistrée comme destinataire, une URL de base écrite en dur.',
			'D et R : 20 requêtes à la suite sont toutes passées, et la seule trace est un print qui contient le jeton. Ajoute une limite par compte, et une entrée de log d’audit avec le compte visé et sans le jeton.',
			'T et E : ce handler ne change aucune donnée stockée et aucun rôle, donc « rien trouvé » est une réponse valable. Écris-la quand même : elle montre que tu as posé la question.'
		]
	},
	recall: {
		q: 'Quelle question STRIDE aurait trouvé la CVE-2023-7028 de GitLab, et quelle est la parade ?',
		a: 'Usurpation : l’attaquant peut-il choisir où part le lien ? Envoie-le seulement à l’adresse enregistrée sur le compte, comme PasswordResetForm de Django avec `user_email`.'
	},
	sources: [
		{ title: 'OWASP Cheat Sheet Series, Threat Modeling', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html' },
		{ title: 'OWASP Cheat Sheet Series, Forgot Password', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html' },
		{ title: 'GitLab, Critical Security Release 16.7.2, 16.6.4, 16.5.6 (11 janvier 2024)', url: 'https://about.gitlab.com/releases/2024/01/11/critical-security-release-gitlab-16-7-2-released/' },
		{ title: 'NVD, CVE-2023-7028', url: 'https://nvd.nist.gov/vuln/detail/CVE-2023-7028' },
		{ title: 'Django, security releases du 18 décembre 2019 (CVE-2019-19844)', url: 'https://www.djangoproject.com/weblog/2019/dec/18/security-releases/' },
		{ title: 'Doc Python, module random', url: 'https://docs.python.org/3/library/random.html' }
	]
};
