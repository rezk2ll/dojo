const CTRD = 'https://github.com/containerd/containerd';
const CRI = 'https://github.com/kubernetes/cri-api/blob/c20fa40/pkg/apis/runtime/v1/api.proto#L67-L68';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'repeated-stop',
	part: 'L’état et le temps',
	title: 'Arrêter, supprimer, arrêter encore',
	minutes: 10,
	hook: [
		'Kubernetes parle à containerd par la CRI, une API gRPC. Sa définition dit que `StopContainer` "is idempotent, and must not return an error if the container has already been stopped." (l’appel est idempotent et ne doit pas renvoyer d’erreur si le conteneur est déjà arrêté). Un appelant qui a perdu la réponse à un arrêt peut le renvoyer.',
		'Le projet cri-tools a ajouté des tests qui envoient deux fois le même appel. Sa pull request dit "Right now all runtimes fail them in various cases." Avec containerd, un arrêt envoyé après la suppression du conteneur **échoue avec "not found"**.'
	],
	terms: [
		{ term: 'CRI', def: 'Container Runtime Interface : l’API gRPC que le kubelet utilise pour démarrer, arrêter et supprimer des conteneurs dans un runtime comme containerd.' },
		{ term: 'Idempotent', def: 'Un appel qu’on peut répéter : l’envoyer deux fois laisse le même état et donne le même genre de réponse que l’envoyer une fois.' },
		{ term: 'errdefs.IsNotFound', def: 'Une fonction de containerd qui dit si une erreur signifie « cet objet n’existe pas ».' }
	],
	bug: {
		title: 'Make `StopContainer` RPC idempotent',
		repo: 'containerd/containerd',
		url: `${CTRD}/blob/ea3e1d9613f257290cffcd5522ad98afe1ed336d/internal/cri/server/container_stop.go#L37-L58`,
		fix: `${CTRD}/commit/a97b11898a195251e0852c94bce6a0189df51ba5`,
		lang: 'go',
		code: `// StopContainer stops a running container with a grace period (i.e., timeout).
func (c *criService) StopContainer(ctx context.Context, r *runtime.StopContainerRequest) (*runtime.StopContainerResponse, error) {
	start := time.Now()
	// Get container config from container store.
	container, err := c.containerStore.Get(r.GetContainerId())
	if err != nil {
		return nil, fmt.Errorf("an error occurred when try to find container %q: %w", r.GetContainerId(), err)
	}

	if err := c.stopContainer(ctx, container, time.Duration(r.GetTimeout())*time.Second); err != nil {
		return nil, err
	}

	sandbox, err := c.sandboxStore.Get(container.SandboxID)
	if err != nil {
		err = c.nri.StopContainer(ctx, nil, &container)
	} else {
		err = c.nri.StopContainer(ctx, &sandbox, &container)
	}
	if err != nil {
		log.G(ctx).WithError(err).Error("NRI failed to stop container")
	}`,
		lines: [7],
		diff: ` 	if err != nil {
-		return nil, fmt.Errorf("an error occurred when try to find container %q: %w", r.GetContainerId(), err)
+		if !errdefs.IsNotFound(err) {
+			return nil, fmt.Errorf("an error occurred when try to find container %q: %w", r.GetContainerId(), err)
+		}
+
+		// The StopContainer RPC is idempotent, and must not return an error if
+		// the container has already been stopped. Ref:
+		// https://github.com/kubernetes/cri-api/blob/c20fa40/pkg/apis/runtime/v1/api.proto#L67-L68
+		return &runtime.StopContainerResponse{}, nil
 	}`,
		notes: [
			'**Toute erreur de recherche est une erreur.** La ligne 6 attrape n’importe quelle erreur de `containerStore.Get` et la ligne 7 la renvoie. L’une de ces erreurs veut dire que l’ID est inconnu, et c’est l’état d’un conteneur supprimé. Pour un arrêt répété, c’est l’état attendu, pas un échec.',
			'**La séquence qui échoue.** Envoie `StopContainer` pour un conteneur : il s’arrête. Envoie `RemoveContainer` : il disparaît du store. Renvoie `StopContainer` avec le même ID : la ligne 7 renvoie "an error occurred when try to find container ...: not found". La CRI dit que cet appel doit réussir.',
			'**La moitié était déjà idempotente.** Un deuxième arrêt sur un conteneur arrêté mais pas supprimé marchait déjà. `stopContainer` commence par "Return without error if container is not running" et renvoie nil. Seule la recherche au-dessus n’avait pas ce cas.',
			'**Le correctif.** Une erreur « introuvable » renvoie maintenant un `StopContainerResponse` vide, sans erreur. Toute autre erreur du store est toujours renvoyée. Le commit dit : "Similar to container removal, the stop of a container should be a noop if the container has not been found." `RemoveContainer` gérait déjà le cas « introuvable » de cette façon.'
		]
	},
	quiz: [
		{
			q: 'Tu appelles `StopContainer`, puis `RemoveContainer`, puis `StopContainer` sur le même ID. Que renvoie le troisième appel avant le correctif ?',
			options: [
				'Une réponse vide, comme le premier arrêt',
				'Une erreur qui dit que le conteneur est introuvable',
				'Un timeout, une fois le délai de grâce écoulé',
				'Un panic, parce que `container` est un pointeur nil'
			],
			answer: 1,
			why: 'Le conteneur supprimé n’est plus dans `containerStore`, donc `Get` renvoie une erreur « introuvable » et la ligne 7 la renvoie à l’appelant.'
		},
		{
			q: 'Pourquoi un deuxième arrêt sur un conteneur arrêté, pas encore supprimé, réussissait-il déjà ?',
			options: [
				'`containerStore.Get` garde en cache la réponse du premier appel',
				'Le plugin NRI avale l’erreur et se contente de la logger',
				'`stopContainer` renvoie nil quand le conteneur ne tourne pas',
				'Le serveur gRPC ignore une requête qu’il a déjà vue'
			],
			answer: 2,
			why: 'Le conteneur est encore dans le store, donc la recherche marche. `stopContainer` voit ensuite un état autre que « running » ou « unknown » et renvoie nil.'
		},
		{
			q: 'Quel test attrape ce genre de bug dans une API qui promet des appels idempotents ?',
			options: [
				'Répéter chaque appel, aussi après la suppression, et attendre un succès',
				'Appeler une fois avec un délai de grâce de zéro seconde',
				'Appeler avec un ID vide et attendre une erreur',
				'Appeler depuis 100 goroutines à la fois et compter les arrêts'
			],
			answer: 0,
			why: 'Le bug n’apparaît qu’au deuxième appel, une fois l’objet disparu. Un seul appel, ou des appels qui voient tous le conteneur, n’atteignent jamais la branche « introuvable ».'
		}
	],
	takeaway: 'Quand une API dit qu’un appel peut être répété, relis chaque retour anticipé de son handler. « Déjà fait » et « déjà disparu » doivent renvoyer un succès, et seules les autres erreurs remontent à l’appelant.',
	sources: [
		{ title: 'containerd, pull request #10521', url: `${CTRD}/pull/10521` },
		{ title: 'cri-tools, pull request #1536, les tests d’idempotence', url: 'https://github.com/kubernetes-sigs/cri-tools/pull/1536' },
		{ title: 'La définition de StopContainer dans la CRI', url: CRI }
	]
};
