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
