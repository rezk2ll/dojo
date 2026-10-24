const CONTAINERD = 'https://github.com/containerd/containerd/blob/eea131263805bb19f26d0ade516c4c375fcc9029';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'overlayfs',
	part: 'Containers from the kernel up',
	title: 'Image layers and overlayfs',
	minutes: 10,
	hook: [
		'A Dockerfile writes a 100 MB file in one `RUN` step and deletes it in the next. In a container from that image, `ls /big.bin` prints `No such file or directory`. Yet `docker history` lists the two steps as `100MB` and `4.1kB`, and `docker save` writes a 103,678,464-byte archive.',
		'The delete step removed no bytes. Its layer is a 77-byte tar with one entry, `.wh.big.bin`: a whiteout, a marker that hides `big.bin` from the layers below. **The 100 MB layer is still part of the image**, and a push or pull of the image carries it.',
		'With `head -c 100000000 /dev/urandom > /big.bin && rm /big.bin` in a single `RUN`, the layer is `4.1kB` and the archive 3,646,464 bytes. These numbers come from Docker 29.9 on Linux 6.17, run while writing this chapter.'
	],
	terms: [
		{ term: 'Lower directory', def: 'A read-only directory tree in an overlay mount. Each image layer is one, and the `lowerdir=` option lists them, top layer first, separated by `:`.' },
		{ term: 'Upper directory', def: 'The writable directory tree on top, set with `upperdir=`. Every change the container makes lands there. Docker calls it the container layer.' },
		{ term: 'Copy-up', def: 'The step where overlayfs copies a file from a lower directory to the upper directory before the first write to it, or before a change to its owner or mode.' },
		{ term: 'Whiteout', def: 'An entry in the upper directory that hides a name from the lower directories. On disk it is a character device with device number 0/0; in an image layer tar it is an empty file named `.wh.<name>`.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['snap["containerd overlay snapshotter"] -->|"mount -t overlay"| merged["/ of the container (merged view)"]', 'lower[("lowerdir: image layers, read-only")] --> merged', 'upper[("upperdir: container layer, empty at start")] --> merged'],
				highlight: ['snap', 'merged'],
				note: 'When a container starts, the snapshotter mounts an overlay as its root. `/proc/self/mountinfo` in an `alpine:3.20` container shows `lowerdir=` with two paths under `snapshots/<id>/fs`, then `upperdir=.../snapshots/25038/fs` and `workdir=.../snapshots/25038/work`. The kernel docs require the work directory to be on the same filesystem as the upper one.'
			},
			{
				add: ['merged -->|"open a.txt for reading"| look{"name in upper? else first lower that has it"}'],
				highlight: ['look'],
				note: 'A lookup checks the upper directory, then the lower ones from the top. The docs: with `lowerdir=/lower1:/lower2:/lower3`, "lower1 will be the top, lower2 the middle and lower3 the bottom layer". A read of an unchanged file goes straight to the lower copy, and nothing is written.'
			},
			{
				add: ['merged -->|"first write to big.bin"| cu["copy_up: whole file copied to upper, then written"]', 'cu --> upper'],
				highlight: ['cu'],
				note: 'Before the first write, overlayfs copies the file up: it creates the parent directories in upper, the file with the same owner, mode and mtime, then copies the data. In this session, `echo x >> merged/big.bin` on a 50,000,000-byte lower file left a 50,000,002-byte file in upper.'
			},
			{
				add: ['merged -->|"rm big.bin"| wh["whiteout in upper: char device 0, 0"]', 'wh --> upper'],
				highlight: ['wh'],
				note: 'A delete cannot touch the lower directory, so overlayfs writes a whiteout. `ls -l upper` showed `c--------- ... 0, 0 ... big.bin`, and `du -s lower` still showed 48,836 KB. The merged view no longer lists `big.bin`.'
			},
			{
				add: ['upper -->|"build step ends"| layer["image layer: tar of upper, .wh.big.bin for the whiteout"]'],
				highlight: ['layer'],
				note: 'During a build, each `RUN` writes its changes to a new layer: a tar of the files it added or changed, plus whiteouts for the ones it deleted. The OCI image spec stores a whiteout as an empty file whose name is "the prefix `.wh.` plus the basename of the path to be deleted". The layers below keep their bytes.'
			}
		]
	},
	example: {
		title: 'plugins/snapshots/overlay/overlay.go: the mount containerd hands to the runtime',
		repo: 'containerd/containerd',
		url: `${CONTAINERD}/plugins/snapshots/overlay/overlay.go#L556-L619`,
		lang: 'go',
		code: `func (o *snapshotter) mounts(s storage.Snapshot, info snapshots.Info) []mount.Mount {
	var options []string
…
	if len(s.ParentIDs) == 0 {
		// if we only have one layer/no parents then just return a bind mount as overlay
		// will not work
		roFlag := "rw"
		if s.Kind == snapshots.KindView {
			roFlag = "ro"
		}
		return []mount.Mount{
			{
				Source: o.upperPath(s.ID),
				Type:   "bind",
				Options: append(options,
					roFlag,
					"rbind",
				),
			},
		}
	}

	if s.Kind == snapshots.KindActive {
		options = append(options,
			"workdir="+o.workPath(s.ID),
			"upperdir="+o.upperPath(s.ID),
		)
	} else if len(s.ParentIDs) == 1 {
		return []mount.Mount{
			{
				Source: o.upperPath(s.ParentIDs[0]),
				Type:   "bind",
				Options: append(options,
					"ro",
					"rbind",
				),
			},
		}
	}

	parentPaths := make([]string, len(s.ParentIDs))
	for i := range s.ParentIDs {
		parentPaths[i] = o.upperPath(s.ParentIDs[i])
	}
	options = append(options, "lowerdir="+strings.Join(parentPaths, ":"))
	options = append(options, o.options...)

	return []mount.Mount{
		{
			Type:    "overlay",
			Source:  "overlay",
			Options: options,
		},
	}
}`,
		notes: [
			'Lines 4 to 20: a snapshot with no parent gets a plain bind mount of its `fs` directory. The comment on line 5 says that with one layer, overlay "will not work".',
			'Lines 23 to 27: an active snapshot, the writable kind a container gets, adds `workdir=` and `upperdir=`, both inside `snapshots/<id>/`.',
			'Lines 28 to 39: a read-only view on a single layer is again a bind mount, now with `ro`.',
			'Lines 41 to 45 build `lowerdir=` by joining the parents\' `fs` paths with `:`. containerd keeps `ParentIDs` "ordered from the highest to the lowest base" ([metastore.go](' + CONTAINERD + '/core/snapshots/storage/metastore.go#L49-L54)), so the newest layer comes first, which is the top for the kernel.',
			'Lines 48 to 54 return one mount of type `overlay`. The runtime then mounts it as the container\'s root, which is the line you read in `/proc/self/mountinfo`.'
		]
	},
	tradeoff: {
		gain: [
			'Containers from the same image share the same lower directories. Docker\'s docs: when you create a container, Docker "only needs to create the thin writable container layer".',
			'A container that deletes a 50 MB lower file leaves the lower directory as it was: `du -s lower` still showed 48,836 KB, for every other container using that layer.'
		],
		cost: [
			'A file deleted in a later layer still ships in the earlier one: the 100 MB layer stays in the image after `rm`.',
			'The first write to a large file copies all of it: appending 2 bytes to a 50 MB file wrote a 50 MB file into upper. Docker\'s docs advise volumes for write-heavy work such as databases.',
			'`chmod` or `chown` on a lower file also triggers a copy-up, so a `RUN chown -R` over a big directory duplicates it in a new layer.'
		]
	},
	task: {
		prompt: 'Build two images from `alpine:3.20`. Image A: `RUN head -c 100000000 /dev/urandom > /big.bin`, then `RUN rm /big.bin`. Image B: the same two commands joined with `&&` in one `RUN`. Compare `docker history` and the size of `docker save <image> | wc -c`. Then extract A\'s archive and list the last layer with `tar tvf`. Explain the numbers.',
		hint: 'In the archive, `manifest.json` lists the layers in order. The last one is the `rm` step.',
		answer: [
			'Image A: `docker history` shows `100MB` for the `head` step and `4.1kB` for `rm`. `docker save` writes 103,678,464 bytes.',
			'A\'s last layer is a 77-byte tar with one entry: `---------- 0/0 0 ... .wh.big.bin`. The whiteout hides `big.bin` in the merged view, and the 100 MB layer below it is unchanged.',
			'Image B: one layer of `4.1kB`, and `docker save` writes 3,646,464 bytes. The file was created and deleted within the same step, so it never reached a layer.',
			'Random bytes do not compress, which is why the 100 MB layer stays near 100 MB in the archive (100,030,702 bytes here).'
		],
		steps: [
			{
				title: 'Build the two images',
				questions: [
					{ q: 'How many layers does image A add on top of `alpine:3.20`?', options: ['One', 'Two, one per `RUN`', 'Three, one per line', 'None, `RUN` steps add no layers'], answer: 1, why: 'Each `RUN` writes its changes to a new layer, so A adds one for `head` and one for `rm`.' },
					{ q: 'What does a `RUN` step\'s layer hold?', options: ['A full copy of the filesystem after the step', 'Only the command line that was run', 'A tar of the files it added or changed, plus whiteouts for deletions', 'A binary diff of each changed block'], answer: 2, why: 'A layer is a changeset: the files the step added or changed, and a `.wh.<name>` entry for each one it deleted.' },
					{ q: 'In image B, why does `big.bin` reach no layer?', options: ['It was created and deleted within the same step', 'The builder skips files over 50 MB', 'B compresses random bytes better', '`&&` runs the second command in a new container'], answer: 0, why: 'The layer records the state at the end of the step. By then `big.bin` is already gone.' },
					{ q: 'Both images start from `alpine:3.20`. What do their containers share on disk?', options: ['Nothing, each image has its own copy', 'Only the `/etc` directory', 'The upper directory', 'The alpine lower directories'], answer: 3, why: 'Containers from the same layers share the same lower directories. Each one gets only its own thin upper directory.' }
				]
			},
			{
				title: 'Compare the sizes',
				questions: [
					{ q: 'What does `docker history` show for A\'s two steps?', options: ['`100MB` and `0B`', '`100MB` and `4.1kB`', '`4.1kB` and `4.1kB`', '`100MB` and `-100MB`'], answer: 1, why: 'The `head` layer holds the 100 MB file. The `rm` layer holds only a whiteout, so it is tiny.' },
					{ q: '`docker save` writes 103,678,464 bytes for A and 3,646,464 for B. What explains the gap?', options: ['A\'s archive includes the build cache', 'B was compressed and A was not', 'A still carries the 100 MB layer, B never had it', 'A has a bigger base image'], answer: 2, why: 'The delete step removed no bytes from the layer below. Only B kept the file out of every layer.' },
					{ q: 'Why does the 100 MB layer stay near 100 MB in the archive?', options: ['Random bytes do not compress', '`docker save` adds the build cache to each layer', 'The whiteout doubles it', 'Docker pads layers to a fixed size'], answer: 0, why: 'The file came from `/dev/urandom`. With nothing to compress, the layer stays about 100,030,702 bytes.' },
					{ q: 'You push image A to a registry. What travels over the network?', options: ['Only the last layer, since it is the newest', 'Only the files visible in the merged view', 'Nothing for `big.bin`, the whiteout cancels it', 'The 100 MB layer too, because it is part of the image'], answer: 3, why: 'A push or pull carries every layer. The whiteout hides the file in the merged view but does not remove the bytes below.' }
				]
			},
			{
				title: 'Read the last layer',
				questions: [
					{ q: 'In the extracted archive, which file tells you the order of the layers?', options: ['`manifest.json`', '`index.json` alone', 'The file names, sorted by hash', '`repositories`'], answer: 0, why: '`manifest.json` lists the layers in order. The last one is the `rm` step.' },
					{ q: '`tar tvf` on that layer prints one entry. Which one?', options: ['`big.bin`, empty', '`.wh.big.bin`, an empty file', '`big.bin.deleted`, 100 MB', 'A character device named `big.bin`'], answer: 1, why: 'The layer is a 77-byte tar holding `.wh.big.bin`, the whiteout in its image layer form.' },
					{ q: 'What does the `.wh.` prefix mean?', options: ['A hidden file the app wrote', 'A hard link to the lower file', 'A whiteout: hide this name from the layers below', 'A file that waits for a copy-up'], answer: 2, why: 'The OCI image spec stores a whiteout as an empty file named "the prefix `.wh.` plus the basename of the path to be deleted".' },
					{ q: 'In a running container\'s upper directory, how does the same whiteout look?', options: ['A `.wh.big.bin` file', 'A symbolic link to `/dev/null`', 'An empty directory', 'A character device with device number 0/0'], answer: 3, why: 'On disk, overlayfs writes a character device 0/0. The `.wh.` name is the form it takes inside a layer tar.' }
				]
			},
			{
				title: 'Explain the numbers',
				questions: [
					{ q: 'Why did `rm` not shrink image A?', options: ['A delete cannot touch a lower layer, so it only adds a whiteout on top', 'Docker forgot to run the `rm` step', 'The `rm` step failed silently', 'Whiteouts take as much space as the file'], answer: 0, why: 'Lower layers are read-only. The new layer hides the name, and the layer below keeps its bytes.' },
					{ q: 'How do you keep a temporary file out of every layer?', options: ['Delete it in a later `RUN`', 'Create and delete it in the same `RUN`', 'Write it to `/tmp`, which is never in a layer', 'Add it to `.dockerignore`'], answer: 1, why: 'A layer is the state at the end of its step. If the file is gone by then, no layer holds it.' },
					{ q: 'A `RUN chown -R app /data` runs over a big directory from an earlier layer. What happens?', options: ['Only the owner field changes in the old layer', 'Nothing is written, ownership is metadata', 'Every file is copied up, so the directory is duplicated in a new layer', 'The build fails because lower layers are read-only'], answer: 2, why: '`chmod` or `chown` on a lower file triggers a copy-up, so the new layer holds a full copy.' },
					{ q: 'A container appends 2 bytes to a 50 MB file from the image. What lands in the upper directory?', options: ['A 2-byte diff', 'Nothing, the write goes to the lower file', 'A whiteout and the 2 bytes', 'A full 50 MB copy of the file, plus the 2 bytes'], answer: 3, why: 'The first write copies the whole file up. In this session, upper held a 50,000,002-byte file.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'A Dockerfile downloads a 300 MB archive in one `RUN` and deletes it in the next `RUN`. How big is the image?',
			options: [
				'About 300 MB bigger, because the first layer still holds the archive',
				'The same as without the archive, because the delete frees the space',
				'About 600 MB bigger, because the delete step copies the archive up',
				'The same, because the builder squashes layers that undo each other'
			],
			answer: 0,
			why: 'The second step\'s layer holds only a whiteout, `.wh.<name>`, which hides the file in the merged view. The first layer is unchanged and still part of the image. Doing both in one `RUN` keeps the file out of every layer.'
		},
		{
			q: 'A container appends one line to a 2 GB file that came from the image. What happens the first time?',
			options: [
				'The line goes into the image layer, which overlayfs makes writable for it',
				'Only the new line is written to the upper directory, as a diff',
				'overlayfs copies the whole 2 GB file to the upper directory, then writes',
				'The write fails with `EROFS`, because the lower directories are read-only'
			],
			answer: 2,
			why: 'A write to a lower file triggers copy-up: overlayfs creates the file in the upper directory and copies all its data before the write. The kernel docs: "the data is copied from the lower to the upper filesystem". Later writes go to the upper copy directly.'
		},
		{
			q: 'Inside a running container, you `rm` a file that comes from the image. What appears in the upper directory?',
			options: [
				'Nothing: overlayfs deletes the file from the lower directory',
				'A character device with device number 0/0 and the same name',
				'A copy of the file, marked with the `trusted.overlay.opaque` attribute',
				'A file named `.wh.<name>` holding the deleted bytes'
			],
			answer: 1,
			why: 'The kernel docs: "A whiteout is created as a character device with 0/0 device number". When the merged view finds it, the matching name in the lower directories is hidden. The `.wh.` name is the form a whiteout takes inside an image layer tar.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Build an image whose delete step frees nothing, find the whiteout in its last layer, and watch a container\'s own changes.',
		steps: [
			'Make two build folders: `mkdir -p ~/layers-lab/a ~/layers-lab/b && cd ~/layers-lab`, then `printf \'FROM alpine:3.20\\nRUN head -c 100000000 /dev/urandom > /big.bin\\nRUN rm /big.bin\\n\' > a/Dockerfile` and `printf \'FROM alpine:3.20\\nRUN head -c 100000000 /dev/urandom > /big.bin && rm /big.bin\\n\' > b/Dockerfile`.',
			'Build both: `docker build -q -t layers-a a && docker build -q -t layers-b b`.',
			'Compare: `docker history layers-a | head -3`, `docker history layers-b | head -2`, then `docker save layers-a | wc -c` and `docker save layers-b | wc -c`.',
			'Open A\'s archive and list its last layer: `mkdir -p out && docker save layers-a | tar -x -C out`, then `LAST=$(grep -o \'blobs/sha256/[0-9a-f]*\' out/manifest.json | tail -1); ls -l out/$LAST; tar tvf out/$LAST`.',
			'Watch a container\'s upper layer: `docker run --name ovl-lab alpine:3.20 sh -c \'rm /etc/motd; echo x >> /etc/profile; touch /new.txt\'`, then `docker diff ovl-lab`. Clean up with `docker rm ovl-lab` and `docker rmi layers-a layers-b`.'
		],
		done: [
			'`docker history layers-a` shows `4.1kB` for the `rm` step and `100MB` for the `head` step. `layers-b` has one step of `4.1kB`.',
			'`docker save` gives about 103.7 million bytes for A and about 3.6 million for B.',
			'The last layer of A is 77 bytes, and `tar tvf` prints one entry, `.wh.big.bin`.',
			'`docker diff` prints `C /etc`, `C /etc/profile`, `D /etc/motd` and `A /new.txt`.'
		],
		solution: [
			'A\'s second `RUN` could not remove bytes from the layer below, so it wrote a whiteout. B created and deleted the file in one step, so no layer ever held it.',
			'`manifest.json` lists the config blob first and the layers in order after it, so the last `blobs/sha256/...` match is the `rm` layer.',
			'`docker diff` reads the container\'s upper directory: `D` is a whiteout, `C` is a copy-up (the whole `/etc/profile` was copied before the append), and `A` is a new file.'
		]
	},
	recall: {
		q: 'A build step deletes a 100 MB file created by the step before. What does the new layer contain, and why does the image not shrink?',
		a: 'A whiteout: a 77-byte tar with one entry, `.wh.big.bin`. It hides the file in the merged view, while the 100 MB layer below keeps its bytes and stays in the image.'
	},
	sources: [
		{ title: 'Linux kernel docs, Overlay Filesystem', url: 'https://docs.kernel.org/filesystems/overlayfs.html' },
		{ title: 'OCI image spec, Image Layer Filesystem Changeset: Whiteouts', url: 'https://github.com/opencontainers/image-spec/blob/ca68a05fad732be329ef67e713c3af60fb7d5f76/layer.md#whiteouts' },
		{ title: 'Docker docs, Storage drivers', url: 'https://docs.docker.com/engine/storage/drivers/' },
		{ title: 'containerd, plugins/snapshots/overlay/overlay.go', url: `${CONTAINERD}/plugins/snapshots/overlay/overlay.go` }
	]
};
