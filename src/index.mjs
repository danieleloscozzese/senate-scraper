import { Command } from "commander";
import { JSDOM } from "jsdom";
import { writeFile } from "node:fs/promises";
/** @type {Record<string, string>} */
import config from "../regions.json" assert { type: "json" };

const program = new Command("Senate Scraper");

program.version("1.0.0");

program.parse(process.argv);

fetch(config.lombardia)
	.then((res) => {
		if (res.ok) {
			return res.text();
		} else {
			throw new Error(res.statusText);
		}
	})
	.then((data) => {
		const dom = new JSDOM(data);

		/** @type NodeListOf<HTMLAnchorElement> */
		const links = dom.window.document.querySelectorAll(
			'.linkSenatore a[href*="senatori"]',
		);

		/** @type {URL[]} */
		const senatorPages = [];

		for (let linkIndex = 0; linkIndex < links.length; linkIndex++) {
			/** @type {string} */
			const ref = links[linkIndex].href;

			if (!ref.startsWith("/")) {
				console.warn("Unexpected URL, not relative:", ref);
			} else {
				senatorPages.push(new URL(ref, "https://www.senato.it/"));
			}
		}

		console.log("Number of pages", senatorPages.length);

		return senatorPages;
	})
	.then((senatorPages) => {
		const mailRequests = senatorPages.map((url) => {
			return fetch(url)
				.then((result) => {
					if (result.ok && result.status === 200) {
						return result.text();
					} else if (result.status === 307) {
						let loc = result.headers.get("Location");
						if (loc === null) {
							throw new RangeError("Unexpected result, cannot follow:", result);
						} else if (loc.startsWith("http:")) {
							loc = loc.replace("http", "https");
						}

						return fetch(loc).then((res) => {
							if (res.ok) {
								return res.text();
							} else {
								throw new Error(res.statusText);
							}
						});
					} else {
						throw new Error(
							`Expected a redirect but the status was ${result.status} and the headers are ${result.headers}`,
						);
					}
				})
				.then((page) => {
					const mailLine = page
						.split("\n")
						.filter((s) => s.includes("cnt_email"));

					if (mailLine.length !== 1) {
						throw new RangeError("There are too many matching lines, or 0.");
					}

					const address = /mailto:(.*@senato.it)"/.exec(mailLine)[1];

					return address;
				})
				.catch((e) => {
					console.error(`Processing issue with ${url}: ${e}`);
				})
				.catch((e) => {
					console.error(`Error retrieving ${url}: ${e}`);
				});
		});

		Promise.all(mailRequests)
			.then((mails) => {
				return mails.filter(Boolean).join("\n");
			})
			.then((list) =>
				writeFile(new URL("../list.txt", import.meta.url), list, "utf8")
					.then(() => {
						console.log("All written");
					})
					.catch((e) => {
						console.error("Error writing");
						console.error(e);
					}),
			);
	})
	.catch((e) => {
		console.error(e);
		process.exitCode = 1;
	});
