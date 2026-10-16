const CTRD = 'https://github.com/containerd/containerd';
const CRI = 'https://github.com/kubernetes/cri-api/blob/c20fa40/pkg/apis/runtime/v1/api.proto#L67-L68';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'repeated-stop',
	part: 'State and time',
	title: 'Stop, remove, stop again',
	minutes: 10,
	hook: [
		'Kubernetes talks to containerd through the CRI, a gRPC API. Its definition says `StopContainer` "is idempotent, and must not return an error if the container has already been stopped." A caller that lost the answer to a stop can send it again.',
		'The cri-tools project added tests that send the same call twice. Its pull request says "Right now all runtimes fail them in various cases." With containerd, a stop sent after the container was removed **fails with "not found"**.'
	],
	terms: [
		{ term: 'CRI', def: 'Container Runtime Interface: the gRPC API the kubelet uses to start, stop and remove containers in a runtime such as containerd.' },
		{ term: 'Idempotent', def: 'A call you can repeat: sending it twice leaves the same state and gives the same kind of answer as sending it once.' },
		{ term: 'errdefs.IsNotFound', def: 'A containerd helper that tells whether an error means "this object does not exist".' }
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
			'**Every lookup error is an error.** Line 6 catches any error from `containerStore.Get` and line 7 returns it. One of those errors means the ID is unknown, which is what a removed container looks like. For a repeated stop, that is the expected state, not a failure.',
			'**The sequence that fails.** Send `StopContainer` for a container: it stops. Send `RemoveContainer`: it is gone from the store. Send `StopContainer` again with the same ID: line 7 returns "an error occurred when try to find container ...: not found". The CRI says this call must succeed.',
			'**Half of it was already idempotent.** A second stop on a container that is stopped but not removed already worked. `stopContainer` starts with "Return without error if container is not running" and returns nil. Only the lookup above it had no such case.',
			'**The fix.** A not-found error now returns an empty `StopContainerResponse` with no error. Any other error from the store is still returned. The commit says: "Similar to container removal, the stop of a container should be a noop if the container has not been found." `RemoveContainer` already handled not-found this way.'
		]
	},
	quiz: [
		{
			q: 'You call `StopContainer`, then `RemoveContainer`, then `StopContainer` on the same ID. What does the third call return before the fix?',
			options: [
				'An empty response, like the first stop',
				'An error saying the container was not found',
				'A timeout once the grace period runs out',
				'A panic, because `container` is a nil pointer'
			],
			answer: 1,
			why: 'The removed container is no longer in `containerStore`, so `Get` returns a not-found error and line 7 sends it back to the caller.'
		},
		{
			q: 'Why did a second stop on a stopped, not yet removed container already succeed?',
			options: [
				'`containerStore.Get` caches the answer of the first call',
				'The NRI plugin swallows the error and only logs it',
				'`stopContainer` returns nil when the container is not running',
				'The gRPC server drops a request it has already seen'
			],
			answer: 2,
			why: 'The container is still in the store, so the lookup works. `stopContainer` then sees a state other than running or unknown and returns nil.'
		},
		{
			q: 'Which test catches this kind of bug in an API that promises idempotent calls?',
			options: [
				'Repeat each call, also after the delete, and expect success',
				'Call it once with a grace period of zero seconds',
				'Call it with an empty container ID and expect an error',
				'Call it from 100 goroutines at once and count the stops'
			],
			answer: 0,
			why: 'The bug only appears on the second call, once the object is gone. A single call, or calls that all see the container, never reach the not-found branch.'
		}
	],
	takeaway: 'When an API says a call can be repeated, read every early return in its handler. "Already done" and "already gone" must return success, and only other errors go back to the caller.',
	sources: [
		{ title: 'containerd pull request #10521', url: `${CTRD}/pull/10521` },
		{ title: 'cri-tools pull request #1536, the idempotence tests', url: 'https://github.com/kubernetes-sigs/cri-tools/pull/1536' },
		{ title: 'The CRI definition of StopContainer', url: CRI }
	]
};
