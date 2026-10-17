/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'docker',
	part: 'Ops tools',
	title: 'docker',
	minutes: 10,
	hook: [
		'Before you put a new nginx config in production, you try the image `nginx:1.27` on your laptop. You run it as a container named `web`, with port 80 of the container published on port 8080 of your machine, so `curl http://localhost:8080` reaches it.',
		'The reps follow `web` from `docker run` to `docker rm`. You also run `alpine:3.20` once to print the file `/etc/alpine-release`, which holds the Alpine version. You pulled both images earlier.'
	],
	terms: [
		{ term: 'Image', def: 'A read-only template with a name and a tag, such as `nginx:1.27`. `docker run` creates a container from it.' },
		{ term: 'Container', def: 'A process started from an image, with its own file system and a name, such as `web`. It stays on disk after it stops, until you remove it.' },
		{ term: 'Published port', def: 'A host port that Docker forwards to a container port. `-p 8080:80` sends host port 8080 to container port 80.' }
	],
	reps: [
		{
			prompt: 'Start `nginx:1.27` in the background, as a container named `web`, with host port 8080 sent to container port 80.',
			accept: [
				'docker run -d --name web -p 8080:80 nginx:1.27',
				'docker run -d -p 8080:80 --name web nginx:1.27',
				'docker run --name web -d -p 8080:80 nginx:1.27',
				'docker run --name web -p 8080:80 -d nginx:1.27',
				'docker run -p 8080:80 -d --name web nginx:1.27',
				'docker run -p 8080:80 --name web -d nginx:1.27',
				'docker run --detach --name web --publish 8080:80 nginx:1.27',
				'docker run -d --name=web -p 8080:80 nginx:1.27',
				'docker container run -d --name web -p 8080:80 nginx:1.27'
			],
			why: '`-d` runs the container in the background and prints its ID, `--name web` gives it a name, and `-p 8080:80` publishes container port 80 on host port 8080. Options go before the image name; anything after it is the command to run inside.'
		},
		{
			prompt: 'List the running containers.',
			accept: ['docker ps', 'docker container ls', 'docker container ps', 'docker container list'],
			why: '`docker ps` shows one row per running container, with its published ports in the `PORTS` column. It is an alias of `docker container ls`.'
		},
		{
			prompt: 'Print the last 20 lines of the logs of `web`.',
			accept: [
				'docker logs --tail 20 web',
				'docker logs -n 20 web',
				'docker logs --tail=20 web',
				'docker logs web --tail 20',
				'docker logs web -n 20',
				'docker container logs --tail 20 web'
			],
			why: '`--tail 20` (short form `-n 20`) keeps only the last 20 lines. Its default is `all`.'
		},
		{
			prompt: 'Follow the logs of `web` live while you run `curl http://localhost:8080` in another terminal.',
			accept: [
				'docker logs -f web',
				'docker logs --follow web',
				'docker logs web -f',
				'docker container logs -f web',
				'docker container logs --follow web'
			],
			why: '`-f` keeps `docker logs` running and prints each new line, here one access log line per curl request. Ctrl-C stops the command, not the container.'
		},
		{
			prompt: 'Open an interactive `sh` shell inside the running container `web`.',
			accept: [
				'docker exec -it web sh',
				'docker exec -ti web sh',
				'docker exec -i -t web sh',
				'docker exec -t -i web sh',
				'docker exec --interactive --tty web sh',
				'docker container exec -it web sh'
			],
			why: '`exec` starts a new process in a running container. `-i` keeps stdin open so `sh` receives what you type, and `-t` allocates a terminal, which makes `sh` print a prompt.'
		},
		{
			prompt: 'Stop the container `web`.',
			accept: ['docker stop web', 'docker container stop web'],
			why: '`docker stop web` sends SIGTERM to the main process, then SIGKILL after a grace period, 10 seconds by default on Linux. The container still exists afterwards.'
		},
		{
			prompt: '`docker ps` no longer shows `web`. List all containers, stopped ones included.',
			accept: ['docker ps -a', 'docker ps --all', 'docker container ls -a', 'docker container ls --all', 'docker container ps -a'],
			why: '`-a` shows every container; by default `docker ps` shows only running ones. `web` appears with a status like `Exited (0) 5 seconds ago`.'
		},
		{
			prompt: 'Remove the stopped container `web`, so the name is free for the next run.',
			accept: ['docker rm web', 'docker container rm web', 'docker container remove web'],
			why: '`docker rm web` deletes the container and its file system. The image `nginx:1.27` stays. To remove a running container you add `-f`, which kills it with SIGKILL first.'
		},
		{
			prompt: 'Run `cat /etc/alpine-release` in a new `alpine:3.20` container that Docker removes as soon as it exits.',
			accept: [
				'docker run --rm alpine:3.20 cat /etc/alpine-release',
				'docker container run --rm alpine:3.20 cat /etc/alpine-release'
			],
			why: '`--rm` removes the container and its anonymous volumes when it exits. Without it, every one-off run leaves a stopped container that `docker ps -a` lists.'
		},
		{
			prompt: 'List the local images of the repository `nginx` only.',
			accept: ['docker images nginx', 'docker image ls nginx', 'docker image list nginx'],
			why: '`docker images nginx` lists the local images whose repository is `nginx`, one row per tag, with image ID and size. With no argument it lists every local image.'
		}
	],
	quiz: [],
	recall: {
		q: 'In `docker run -p 8080:80 nginx:1.27`, which number is the host port?',
		a: '8080. The form is `HOST:CONTAINER`, so host port 8080 goes to port 80 inside the container.'
	},
	sources: [
		{ title: 'docker container run', url: 'https://docs.docker.com/reference/cli/docker/container/run/' },
		{ title: 'docker container ls', url: 'https://docs.docker.com/reference/cli/docker/container/ls/' },
		{ title: 'docker container logs', url: 'https://docs.docker.com/reference/cli/docker/container/logs/' },
		{ title: 'docker container exec', url: 'https://docs.docker.com/reference/cli/docker/container/exec/' },
		{ title: 'docker container stop', url: 'https://docs.docker.com/reference/cli/docker/container/stop/' },
		{ title: 'docker container rm', url: 'https://docs.docker.com/reference/cli/docker/container/rm/' },
		{ title: 'docker image ls', url: 'https://docs.docker.com/reference/cli/docker/image/ls/' }
	]
}
