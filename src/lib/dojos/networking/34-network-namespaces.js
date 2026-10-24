const CNI = 'https://github.com/containernetworking/plugins/blob/268232e54c89bae2bf2b1548e03ff183a7a6f9e9';
const MOBY = 'https://github.com/moby/moby/blob/3f38b15147b14ce0ce7b11558a1aa9e9f14db103/daemon/libnetwork/drivers/bridge/bridge_linux.go';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'network-namespaces',
	part: 'Debugging the network',
	title: 'Network namespaces',
	minutes: 10,
	hook: [
		'PostgreSQL runs on your laptop and listens on 127.0.0.1:5432. Your app runs in a Docker container and connects to `localhost:5432`. The connection is refused, although `psql -h localhost` works fine on the laptop.',
		'Inside the container, `localhost` is the loopback device of the container itself. The container runs in its own network namespace, with its own devices, addresses, routes, firewall rules and ports. Nothing listens on port 5432 in there.',
		'A veth pair joins that namespace to the host, and its host end is attached to the `docker0` bridge. Container traffic enters the host routing and firewall through that host end.'
	],
	terms: [
		{ term: 'Network namespace', def: 'A separate copy of the kernel network stack, with its own network devices, routes, firewall rules and ports. A process belongs to exactly one and inherits it from its parent.' },
		{ term: 'veth pair', def: 'Two virtual Ethernet devices joined back to back: a packet sent on one is received at once on the other. The two ends can sit in different namespaces.' },
		{ term: 'Bridge', def: 'A virtual switch in the kernel, such as `docker0`. Devices attached to it with `master` exchange Ethernet frames as if they were plugged into one switch.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['ns["netns of the container: lo only"]', 'host["host netns: eth0, docker0 172.17.0.1/16"]'],
				highlight: ['ns', 'host'],
				note: 'The runtime creates a new network namespace, as `ip netns add app` would. ip-netns(8): "A network namespace is logically another copy of the network stack, with its own routes, firewall rules, and network devices." At first it holds only `lo`.'
			},
			{
				add: ['ns --- c0["eth0 in the container"]', 'c0 ===|"veth pair"| v["vetha14c4f7 on the host"]', 'host --- v'],
				highlight: ['c0', 'v'],
				note: 'A veth pair is created, as with `ip link add vetha14c4f7 type veth peer eth0 netns app`, which puts the `eth0` end straight into the container namespace. veth(4): "Packets transmitted on one device in the pair are immediately received on the other device."'
			},
			{
				add: ['v -->|"master docker0"| br["bridge docker0 172.17.0.1"]'],
				highlight: ['br'],
				note: 'The host end joins the bridge, as `ip link set vetha14c4f7 master docker0` does. Every container on this bridge has one such host end on `docker0`, so they reach each other on 172.17.0.0/16 and reach the host at 172.17.0.1.'
			},
			{
				add: ['c0 -.->|"172.17.0.6/16, default via 172.17.0.1"| br'],
				highlight: ['c0'],
				note: 'Inside the namespace, `eth0` gets 172.17.0.6/16 and a default route via 172.17.0.1, the bridge address. A packet to 8.8.8.8 leaves `eth0`, comes out of `vetha14c4f7` and reaches the host through `docker0`.'
			},
			{
				add: ['br -->|"forward hook, masquerade"| out["host eth0 to the internet"]'],
				highlight: ['out'],
				note: 'From `docker0`, the host routes the packet like any other. It passes the forward hook, and the masquerade rule of chapter 33 swaps 172.17.0.6 for the host address before it leaves through the host `eth0`.'
			}
		]
	},
	example: {
		title: 'CNI plugins, plugins/main/bridge/bridge.go: setupVeth',
		repo: 'containernetworking/plugins',
		url: `${CNI}/plugins/main/bridge/bridge.go#L428-L469`,
		lang: 'go',
		code: `func setupVeth(
	netns ns.NetNS,
	br *netlink.Bridge,
	ifName string,
	mtu int,
	hairpinMode bool,
	vlanID int,
	vlans []int,
	preserveDefaultVlan bool,
	mac string,
	portIsolation bool,
) (*current.Interface, *current.Interface, error) {
	contIface := &current.Interface{}
	hostIface := &current.Interface{}

	err := netns.Do(func(hostNS ns.NetNS) error {
		// create the veth pair in the container and move host end into host netns
		hostVeth, containerVeth, err := ip.SetupVeth(ifName, mtu, mac, hostNS)
		if err != nil {
			return err
		}
		contIface.Name = containerVeth.Name
		contIface.Mac = containerVeth.HardwareAddr.String()
		contIface.Sandbox = netns.Path()
		hostIface.Name = hostVeth.Name
		return nil
	})
	if err != nil {
		return nil, nil, err
	}

	// need to lookup hostVeth again as its index has changed during ns move
	hostVeth, err := netlinksafe.LinkByName(hostIface.Name)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to lookup %q: %v", hostIface.Name, err)
	}
	hostIface.Mac = hostVeth.Attrs().HardwareAddr.String()

	// connect host veth end to the bridge
	if err := netlink.LinkSetMaster(hostVeth, br); err != nil {
		return nil, nil, fmt.Errorf("failed to connect %q to bridge %v: %v", hostVeth.Attrs().Name, br.Attrs().Name, err)
	}`,
		notes: [
			'The `bridge` plugin of the CNI project (Container Network Interface) wires each container with this function. Line 16 runs the closure inside the container namespace. `hostNS` is the namespace the plugin came from, the host.',
			'Line 18 creates the pair from inside the container. In [`makeVethPair`](' + CNI + '/pkg/ip/link_linux.go#L40-L44) the peer gets `PeerNamespace: netlink.NsFd(int(hostNS.Fd()))`, so the host end is created straight in the host namespace.',
			'Lines 32 and 33 look the host end up again by name. The comment on line 32 gives the reason: the device index "has changed during ns move".',
			'Line 40 is the code form of `ip link set <veth> master <bridge>`. Docker\'s bridge driver makes the same call on its host end in [bridge_linux.go](' + MOBY + '#L1055).',
			'Real output from a container started in this session with `docker run alpine:3.20`: inside, `ip link` shows `2: eth0@if559` and `ip route` shows `default via 172.17.0.1 dev eth0`. On the host, interface 559 is `vetha14c4f7@if2 ... master docker0`.'
		]
	},
	tradeoff: {
		gain: [
			'Ports are per namespace, so two containers can both listen on port 80 without a conflict.',
			'network_namespaces(7): "When a namespace is freed, the veth(4) devices that it contains are destroyed." When the last process of a container exits, its veth pair goes away.',
			'Each namespace has its own routes and firewall rules, so a rule inside one container does not change the host or other containers.'
		],
		cost: [
			'`localhost` inside a container is the container. A service on the host must listen on an address the container can route to, such as 172.17.0.1.',
			'A packet from a container to the internet crosses the veth pair, the bridge, the forward hook and a masquerade rule. A fault at any of these four places looks the same from the app: no reply.',
			'Docker keeps its namespaces under `/var/run/docker/netns`, and `ip netns list` reads only `/var/run/netns`. The containers of this host do not show up in that list.'
		]
	},
	task: {
		prompt: 'Real output from this session. In the container: `2: eth0@if559: <BROADCAST,MULTICAST,UP,LOWER_UP,M-DOWN> mtu 1500`, `inet 172.17.0.6/16`, `default via 172.17.0.1 dev eth0`, and `cat /sys/class/net/eth0/iflink` prints `559`. On the host: `559: vetha14c4f7@if2: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue master docker0`. Which host device is the other end of `eth0`, which bridge carries it, and what address should the app use to reach a PostgreSQL on the host?',
		hint: 'In `name@ifN`, N is the index of the peer device in the other namespace.',
		answer: [
			'`eth0@if559` and `iflink` 559 say the peer has index 559 in another namespace. On the host, index 559 is `vetha14c4f7`, and its own `@if2` points back at index 2, the container `eth0`.',
			'`master docker0` on the host end says the pair is attached to the `docker0` bridge, whose address is 172.17.0.1/16.',
			'The container route `default via 172.17.0.1` sends traffic for the host to `docker0`. PostgreSQL must listen on 172.17.0.1 (or on all addresses) and accept 172.17.0.0/16, and the app connects to 172.17.0.1:5432.'
		],
		steps: [
			{
				title: 'Read the container side',
				questions: [
					{ q: 'In `2: eth0@if559`, what is `2`?', options: ['The index of `eth0` in the container namespace', 'The number of addresses on `eth0`', 'The index of the peer on the host', 'The VLAN of the device'], answer: 0, why: 'The number before the colon is the device index in its own namespace.' },
					{ q: 'What does `@if559` tell you?', options: ['`eth0` has 559 packets queued', 'The peer device has index 559 in another namespace', '`eth0` is the 559th container on the host', 'The bridge has index 559'], answer: 1, why: 'In `name@ifN`, N is the index of the peer device in the other namespace.' },
					{ q: 'What does `cat /sys/class/net/eth0/iflink` printing `559` add?', options: ['It shows the MTU of the link', 'It shows how many hops away the host is', 'It confirms the same peer index, 559', 'It shows the container PID'], answer: 2, why: '`iflink` holds the index of the linked device. It matches the `@if559` that `ip link` prints.' },
					{ q: 'What is `inet 172.17.0.6/16`?', options: ['The host address on `docker0`', 'The address of the host end of the pair', 'The default gateway', 'The container address on the bridge network'], answer: 3, why: 'It is the address of `eth0` inside the container namespace. The gateway comes from the route line.' }
				]
			},
			{
				title: 'Find the host end',
				questions: [
					{ q: 'Which host device is the other end of `eth0`?', options: ['`docker0`', '`vetha14c4f7`', 'The host `eth0`', '`lo` on the host'], answer: 1, why: 'On the host, index 559 is `vetha14c4f7`, the index the container side pointed to.' },
					{ q: 'In `vetha14c4f7@if2`, what does `@if2` point at?', options: ['The container `eth0`, index 2', 'The second bridge on the host', 'The second container started', 'Interface 2 on the host'], answer: 0, why: 'Each end names the index of its peer. Index 2 is `eth0` in the container namespace.' },
					{ q: 'A packet leaves the container on `eth0`. Where does it appear?', options: ['On `docker0` directly, with no device in between', 'On the host `eth0`', 'At once on `vetha14c4f7`', 'Nowhere until a route is added on the host'], answer: 2, why: 'veth(4): packets sent on one device of the pair are immediately received on the other.' },
					{ q: 'You run `ip link set vetha14c4f7 down` on the host. What happens to `eth0`?', options: ['Nothing, it is in another namespace', 'It is deleted', 'It loses its address', 'Its link goes down'], answer: 3, why: 'When either device of a veth pair is down, the link state of the pair is down.' }
				]
			},
			{
				title: 'Find the bridge',
				questions: [
					{ q: 'Which part of the host line names the bridge?', options: ['`master docker0`', '`qdisc noqueue`', '`mtu 1500`', '`<BROADCAST,MULTICAST,UP,LOWER_UP>`'], answer: 0, why: '`master docker0` says the host end is attached to the `docker0` bridge.' },
					{ q: 'What is the address of `docker0`?', options: ['172.17.0.6/16', '127.0.0.1', '172.17.0.1/16', '172.17.0.0/16'], answer: 2, why: 'The bridge has 172.17.0.1/16. 172.17.0.6 is the container, and 172.17.0.0/16 is the network.' },
					{ q: 'What does `default via 172.17.0.1 dev eth0` do?', options: ['It makes 172.17.0.1 the container address', 'It sends traffic for other networks to the bridge address', 'It forwards host traffic into the container', 'It publishes port 5432'], answer: 1, why: 'Any packet with no more specific route leaves `eth0` toward 172.17.0.1, the bridge, and enters the host from there.' },
					{ q: 'Another container also has its host end on `docker0`. Can the two reach each other?', options: ['No, each namespace is fully cut off', 'Only through the host `eth0`', 'Only with a published port', 'Yes, on 172.17.0.0/16 through the bridge'], answer: 3, why: 'A bridge acts as one switch. Every container with a host end on `docker0` shares 172.17.0.0/16.' }
				]
			},
			{
				title: 'Reach PostgreSQL on the host',
				questions: [
					{ q: 'Why does `localhost:5432` fail inside the container?', options: ['`localhost` is the container\'s own `lo`, with nothing on 5432', 'Docker blocks port 5432 by default', 'DNS does not resolve `localhost` in containers', 'PostgreSQL rejects connections from containers'], answer: 0, why: 'Each namespace has its own loopback and its own ports. The kernel in the container answers with an RST.' },
					{ q: 'Which address should the app connect to?', options: ['172.17.0.6:5432', '172.17.0.1:5432', '127.0.0.1:5432', '0.0.0.0:5432'], answer: 1, why: '172.17.0.1 is the host on the bridge, reachable through the container default route.' },
					{ q: 'What must PostgreSQL listen on?', options: ['127.0.0.1 only', '172.17.0.6', '172.17.0.1, or all addresses', 'The `vetha14c4f7` index'], answer: 2, why: 'A server on 127.0.0.1 is reachable only from the host loopback. It must listen on an address the container can route to.' },
					{ q: 'Which client network must PostgreSQL accept?', options: ['127.0.0.0/8', 'Only 172.17.0.1', 'The host public network', '172.17.0.0/16'], answer: 3, why: 'The container connects from 172.17.0.6, inside 172.17.0.0/16. Any other container on the bridge would too.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'A service on the host listens on 127.0.0.1:8080. A container on the default bridge runs `curl http://localhost:8080/`. What happens?',
			options: [
				'It reaches the host service, because loopback is shared with the host',
				'The connection is refused, because the container has its own `lo` with nothing on 8080',
				'It times out, because the bridge drops packets to 127.0.0.1',
				'It reaches the service only if port 8080 is published with `-p`'
			],
			answer: 1,
			why: 'Each network namespace has its own devices and ports, including its own loopback. Inside the container, 127.0.0.1 is the container, and the kernel there answers a SYN to a closed port with an RST.'
		},
		{
			q: 'On the host you run `ip link set vetha14c4f7 down`. What does the container see on `eth0`?',
			options: [
				'Nothing changes, because the two ends live in different namespaces',
				'`eth0` stays up but loses its IP address',
				'`eth0` is deleted from the container namespace',
				'The link of `eth0` goes down, since either end being down takes the pair down'
			],
			answer: 3,
			why: 'veth(4): "When either device is down, the link state of the pair is down." Setting a device down does not delete it, so `eth0` is still there, with its link down.'
		},
		{
			q: 'A Docker host runs 12 containers, yet `ip netns list` prints nothing. Why?',
			options: [
				'The containers share the host network namespace',
				'`ip netns list` shows only namespaces with a veth pair',
				'Docker keeps its namespaces outside `/var/run/netns`, the directory `ip netns` reads',
				'`ip netns list` needs the `-all` flag to show namespaces of other users'
			],
			answer: 2,
			why: '`ip netns list` displays the named namespaces in `/var/run/netns`. Docker records each container namespace elsewhere, for example `/var/run/docker/netns/727b28c428b4` in `docker inspect` output.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Follow a container\'s `eth0` to its veth peer and the bridge, then see why `localhost` is the wrong address for a host service.',
		steps: [
			'Start a container: `docker run -d --name ns-lab alpine:3.20 sleep 3600`. This needs Docker on Linux: on macOS the host side lives in Docker\'s VM.',
			'Look inside: `docker exec ns-lab ip link`, `docker exec ns-lab ip route` and `docker exec ns-lab cat /sys/class/net/eth0/iflink`.',
			'Find the peer on the host: `ip -o link | grep "^$(docker exec ns-lab cat /sys/class/net/eth0/iflink):"`.',
			'Start a web server on the host loopback: `python3 -m http.server 8099 --bind 127.0.0.1 &`, then `docker exec ns-lab wget -qO- -T 3 http://localhost:8099/`. Stop it with `kill %1`.',
			'Start it again on the bridge address (`ip -4 addr show docker0` prints it, 172.17.0.1 by default): `python3 -m http.server 8099 --bind 172.17.0.1 & sleep 1`, then `docker exec ns-lab wget -qO- -T 3 http://172.17.0.1:8099/`. Clean up with `kill %1 && docker rm -f ns-lab`.'
		],
		done: [
			'Inside, `ip link` shows `eth0@ifN` and `iflink` prints the same N.',
			'On the host, device N is a `veth...@if2` line with `master docker0`.',
			'`wget` to `localhost:8099` fails with `Connection refused`.',
			'`wget` to `172.17.0.1:8099` prints an HTML directory listing.'
		],
		solution: [
			'`ip route` inside shows `default via 172.17.0.1 dev eth0`: the bridge address is the container\'s way to the host.',
			'The refusal comes from the container\'s own `lo`: nothing listens on 8099 in its namespace, so its kernel answers the SYN with an RST.',
			'If the second `wget` times out instead, a host firewall on the input hook drops traffic from `docker0`. That is chapter 33 again.'
		]
	},
	recall: {
		q: 'How does a container\'s `eth0` reach the host\'s `docker0` bridge?',
		a: 'Through a veth pair. One end is `eth0` in the container namespace, the peer (here `vetha14c4f7`, index 559) sits in the host namespace with `master docker0`. A packet sent on one end arrives at once on the other.'
	},
	sources: [
		{ title: 'ip-netns(8) manual page', url: 'https://man7.org/linux/man-pages/man8/ip-netns.8.html' },
		{ title: 'veth(4) manual page', url: 'https://man7.org/linux/man-pages/man4/veth.4.html' },
		{ title: 'network_namespaces(7) manual page', url: 'https://man7.org/linux/man-pages/man7/network_namespaces.7.html' },
		{ title: 'ip-link(8) manual page', url: 'https://man7.org/linux/man-pages/man8/ip-link.8.html' },
		{ title: 'Docker docs, Bridge network driver', url: 'https://docs.docker.com/engine/network/drivers/bridge/' },
		{ title: 'CNI plugins source, plugins/main/bridge/bridge.go', url: `${CNI}/plugins/main/bridge/bridge.go` }
	]
};
