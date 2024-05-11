import { Command } from "commander";
import { JSDOM } from "jsdom";
import { writeFile, mkdir } from "node:fs/promises";
/** @type {Record<string, string>} */
import config from "./regions.json" assert { type: "json" };

const program = new Command("Senate Scraper");

program.version("19.0.0");

program.parse(process.argv);

/**
 * Fetches the list of emails for a region and writes it to disc.
 * @param {String} region The region for which to get the list.
 */
const fetchForRegion = async (region) => {
	const logTag = `[${region.toLocaleUpperCase("it")}]:`;

	const regionUrl = config[region];

	console.log(logTag, "fetch", regionUrl);

	const rawResponse = await fetch(regionUrl).then((res) => {
		if (res.ok) {
			return res.text();
		} else {
			throw new Error(res.statusText);
		}
	});

	const dom = new JSDOM(rawResponse);

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
			console.warn(logTag, "unexpected URL, not relative:", ref);
		} else {
			senatorPages.push(new URL(ref, "https://www.senato.it/"));
		}
	}

	console.log(logTag, "number of pages", senatorPages.length);

	const mailRequests = senatorPages.map(async (url) => {
		const page = await fetch(url).then((result) => {
			if (result.ok && result.status === 200) {
				return result.text();
			} else {
				throw new Error(
					`${logTag} Expected OK but the status was ${result.status} and the headers are ${result.headers}`,
				);
			}
		});
		try {
			const mailLine = page.split("\n").filter((s) => s.includes("cnt_email"));

			if (mailLine.length !== 1) {
				throw new RangeError("There are too many matching lines, or 0.");
			}

			const address = /mailto:(.*@senato.it)"/.exec(mailLine)[1];

			return address;
		} catch (e) {
			console.error(logTag, `Processing issue with ${url}`, e);
		}
	});

	const mails = await Promise.all(mailRequests);

	const fileBody = mails.filter((m) => m !== undefined).join("\n");

	await writeFile(
		new URL(`../results/${region}.txt`, import.meta.url),
		fileBody,
		"utf8",
	)
		.then(() => {
			console.log(logTag, "result written");
		})
		.catch((e) => {
			console.error(logTag, "Error writing");
			console.error(e);
		});
};

await mkdir(new URL("../results", import.meta.url)).catch((e) => {
	if (e.code === "EEXIST") {
		return;
	} else {
		console.log(e);
		process.exitCode = 1;
	}
});

Object.keys(config).forEach(async (k) => {
	await fetchForRegion(k);
});
