const SEP = '--';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'kubectl-debug',
	part: 'Ops tools',
	title: 'kubectl for debugging',
	minutes: 10,
	hook: [
		'Two things are broken in the namespace `shop`. The pods of the Deployment `api` restart every few seconds. The last deploy of the Deployment `web` is stuck, and the 3 old pods still serve the traffic.',
		'The pod `api-8b74f5cbb-4zbdm` has two containers: `api` prints `api started`, then `db unreachable`, and exits with code 1; `log-shipper` prints `shipped` every 10 seconds. The Deployment `web` has 3 revisions: 1 runs `nginx:1.27`, 2 runs `nginx:1.28`, and 3 asks for `nginx:1.288`, a tag that does not exist, so its new pod stays in `ImagePullBackOff`. The pod `cache-0` runs Redis. Every command needs `-n shop`.'
	],
	terms: [
		{ term: 'container', def: 'One process with its own image inside a pod. A pod with two containers needs `-c` to say which one you mean.' },
		{ term: 'CrashLoopBackOff', def: 'The status kubectl shows for a container that keeps crashing. The kubelet waits 10 s, 20 s, 40 s and so on between restarts, up to 5 minutes.' },
		{ term: 'revision', def: 'A numbered version of a Deployment’s pod template. A change to the template, such as a new image, creates one; scaling does not.' }
	],
	reps: [
		{
			prompt: 'Print the logs of the container `api` in the pod `api-8b74f5cbb-4zbdm`.',
			accept: [
				'kubectl logs api-8b74f5cbb-4zbdm -n shop -c api',
				'kubectl logs api-8b74f5cbb-4zbdm -c api -n shop',
				'kubectl -n shop logs api-8b74f5cbb-4zbdm -c api',
				'kubectl logs -n shop api-8b74f5cbb-4zbdm -c api',
				'kubectl logs api-8b74f5cbb-4zbdm -n shop --container api',
				'kubectl logs api-8b74f5cbb-4zbdm -n shop --container=api',
				'kubectl logs pod/api-8b74f5cbb-4zbdm -n shop -c api'
			],
			why: '`-c api` picks the container. Without it, kubectl prints `Defaulted container "api" out of: api, log-shipper` and uses the first one.'
		},
		{
			prompt: 'The container `api` has just restarted. Print the logs of the run that crashed before the current one.',
			accept: [
				'kubectl logs api-8b74f5cbb-4zbdm -n shop -c api --previous',
				'kubectl logs api-8b74f5cbb-4zbdm -n shop -c api -p',
				'kubectl logs api-8b74f5cbb-4zbdm -n shop --previous -c api',
				'kubectl logs api-8b74f5cbb-4zbdm -n shop -p -c api',
				'kubectl logs -p api-8b74f5cbb-4zbdm -n shop -c api',
				'kubectl logs --previous api-8b74f5cbb-4zbdm -n shop -c api',
				'kubectl logs api-8b74f5cbb-4zbdm -c api --previous -n shop',
				'kubectl -n shop logs api-8b74f5cbb-4zbdm -c api --previous',
				'kubectl logs api-8b74f5cbb-4zbdm -n shop --container=api --previous'
			],
			why: '`--previous` (short `-p`) prints the logs of the previous instance of the container. That run ended with `db unreachable`, the line that explains the crash.'
		},
		{
			prompt: 'Stream the logs of the container `log-shipper` in the same pod, and keep printing new lines as they come.',
			accept: [
				'kubectl logs -f api-8b74f5cbb-4zbdm -n shop -c log-shipper',
				'kubectl logs api-8b74f5cbb-4zbdm -n shop -c log-shipper -f',
				'kubectl logs api-8b74f5cbb-4zbdm -n shop -f -c log-shipper',
				'kubectl logs --follow api-8b74f5cbb-4zbdm -n shop -c log-shipper',
				'kubectl logs api-8b74f5cbb-4zbdm -n shop -c log-shipper --follow',
				'kubectl -n shop logs -f api-8b74f5cbb-4zbdm -c log-shipper',
				'kubectl logs -f api-8b74f5cbb-4zbdm -c log-shipper -n shop'
			],
			why: '`-f` is short for `--follow`. kubectl prints the existing lines, then a new `shipped` line every 10 seconds until you stop it.'
		},
		{
			prompt: 'Open an interactive shell `sh` inside the pod `cache-0`.',
			accept: [
				`kubectl exec -it cache-0 -n shop ${SEP} sh`,
				`kubectl exec -ti cache-0 -n shop ${SEP} sh`,
				`kubectl exec -i -t cache-0 -n shop ${SEP} sh`,
				`kubectl exec --stdin --tty cache-0 -n shop ${SEP} sh`,
				`kubectl exec cache-0 -n shop -it ${SEP} sh`,
				`kubectl -n shop exec -it cache-0 ${SEP} sh`,
				`kubectl exec -n shop -it cache-0 ${SEP} sh`,
				`kubectl exec -it cache-0 -n shop ${SEP} /bin/sh`,
				`kubectl exec -it pod/cache-0 -n shop ${SEP} sh`
			],
			why: '`-i` passes your input to the container and `-t` tells it that the input is a terminal. Everything after `--` is the command to run in the container, so its own flags never reach kubectl.'
		},
		{
			prompt: 'Forward local port 8080 to port 80 of a pod of the Deployment `web`, so that `curl localhost:8080` reaches nginx.',
			accept: [
				'kubectl port-forward deploy/web 8080:80 -n shop',
				'kubectl port-forward deployment/web 8080:80 -n shop',
				'kubectl port-forward deployments/web 8080:80 -n shop',
				'kubectl port-forward deploy/web -n shop 8080:80',
				'kubectl -n shop port-forward deploy/web 8080:80',
				'kubectl port-forward -n shop deploy/web 8080:80',
				'kubectl port-forward -n shop deployment/web 8080:80'
			],
			why: '`8080:80` is local port first, pod port second. With `deploy/web`, kubectl picks one pod of the Deployment, and the forward ends when that pod stops.'
		},
		{
			prompt: 'Watch the rollout of the Deployment `web` until it finishes or you stop it.',
			accept: [
				'kubectl rollout status deployment/web -n shop',
				'kubectl rollout status deploy/web -n shop',
				'kubectl rollout status deployment web -n shop',
				'kubectl rollout status deployments/web -n shop',
				'kubectl -n shop rollout status deployment/web',
				'kubectl rollout status -n shop deployment/web'
			],
			why: '`rollout status` waits for the latest rollout. Here it stays on `1 out of 3 new replicas have been updated...`, because the new pod cannot pull `nginx:1.288`.'
		},
		{
			prompt: 'List the revisions of the Deployment `web`.',
			accept: [
				'kubectl rollout history deployment/web -n shop',
				'kubectl rollout history deploy/web -n shop',
				'kubectl rollout history deployment web -n shop',
				'kubectl rollout history deployments/web -n shop',
				'kubectl -n shop rollout history deployment/web',
				'kubectl rollout history -n shop deployment/web'
			],
			why: '`rollout history` prints one row per revision, with the newest at the bottom. The `CHANGE-CAUSE` column shows `<none>` unless someone set the annotation `kubernetes.io/change-cause`.'
		},
		{
			prompt: 'Show the pod template of revision 2 only, to see which image it ran.',
			accept: [
				'kubectl rollout history deployment/web -n shop --revision=2',
				'kubectl rollout history deployment/web -n shop --revision 2',
				'kubectl rollout history deploy/web -n shop --revision=2',
				'kubectl rollout history deployment web -n shop --revision=2',
				'kubectl rollout history deployment/web --revision=2 -n shop',
				'kubectl -n shop rollout history deployment/web --revision=2',
				'kubectl rollout history deployments/web -n shop --revision=2'
			],
			why: '`--revision=2` prints the template of that one revision, with the line `Image: nginx:1.28`.'
		},
		{
			prompt: 'Roll the Deployment `web` back to the revision before the current one.',
			accept: [
				'kubectl rollout undo deployment/web -n shop',
				'kubectl rollout undo deploy/web -n shop',
				'kubectl rollout undo deployment web -n shop',
				'kubectl rollout undo deployments/web -n shop',
				'kubectl -n shop rollout undo deployment/web',
				'kubectl rollout undo -n shop deployment/web'
			],
			why: '`rollout undo` with no revision goes back one step, from `nginx:1.288` to `nginx:1.28`. kubectl prints `deployment.apps/web rolled back`.'
		},
		{
			prompt: 'Start again from the stuck state, and this time roll `web` back to revision 1.',
			accept: [
				'kubectl rollout undo deployment/web -n shop --to-revision=1',
				'kubectl rollout undo deployment/web -n shop --to-revision 1',
				'kubectl rollout undo deploy/web -n shop --to-revision=1',
				'kubectl rollout undo deployment web -n shop --to-revision=1',
				'kubectl rollout undo deployment/web --to-revision=1 -n shop',
				'kubectl -n shop rollout undo deployment/web --to-revision=1',
				'kubectl rollout undo deployments/web -n shop --to-revision=1'
			],
			why: '`--to-revision=1` brings back the template of revision 1, `nginx:1.27`. Kubernetes stores that template again under the new number 4, and revision 1 leaves the `rollout history` list.'
		}
	],
	quiz: [],
	recall: {
		q: 'A container restarted after a crash. Which `kubectl logs` flag shows the output of the run that crashed?',
		a: '`--previous` (or `-p`). It prints the logs of the previous instance of the container.'
	},
	sources: [
		{ title: 'kubectl logs reference', url: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_logs/' },
		{ title: 'kubectl exec reference', url: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_exec/' },
		{ title: 'kubectl port-forward reference', url: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_port-forward/' },
		{ title: 'kubectl rollout undo reference', url: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_rollout/kubectl_rollout_undo/' },
		{ title: 'Kubernetes docs: Deployments, rolling back', url: 'https://kubernetes.io/docs/concepts/workloads/controllers/deployment/' },
		{ title: 'Kubernetes docs: debug running pods', url: 'https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/' }
	]
};
