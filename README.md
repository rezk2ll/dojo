# Dojo

Short daily lessons on software, in French and English. Each dojo is a path of 40 chapters, and every example points at real open-source code at a fixed commit.

- DevOps Dojo: from sysadmin to DevOps engineer.
- Architecture Dojo: software architecture.

Each dojo installs as its own app on a phone, and works offline. Questions you answer come back 1, 3, 7, 21 and 45 days later. The home page mixes reviews from every dojo, ten a day at most. Progress stays in your browser.

## Run it

```sh
npm install
npm run dev
```

## Add a chapter

A chapter is one file in `src/lib/dojos/<dojo>/`, named `NN-slug.js`, with its French version in `fr/` under the same name. The number is the day. The `Chapter` type in `src/lib/content.js` lists the fields. Diagrams are Mermaid flowchart lines, shown one step at a time.

A new dojo is an entry in `src/lib/dojos/index.js` plus its icons and manifest in `static/<dojo>/`.

## Deploy

A push to `main` checks the site, builds it and publishes it to GitHub Pages. Any static host works too: `npm run build` writes the site to `build/`. Set `BASE_PATH` when the site is served from a sub-path.

## License

The code is under the [MIT license](LICENSE). The chapters in `src/lib/dojos/` are under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
