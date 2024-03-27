// @ts-check
import { Command } from "commander";
import { JSDOM } from "jsdom";
import { readFile, writeFile } from "node:fs/promises";

const config = JSON.parse(
  await readFile(new URL("../regions.json", import.meta.url))
);

const program = new Command();

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

    const links = dom.window.document.querySelectorAll(
      ".linkSenatore a[href*=sattsen]"
    );

    /** @type {String[]} */
    const senatorPages = [];

    for (let linkIndex = 0; linkIndex < links.length; linkIndex++) {
      /** @type {string} */
      const ref = links[linkIndex].href;

      if (ref.startsWith("http")) {
        senatorPages.push(ref);
      } else {
        senatorPages.push(`http://www.senato.it${ref}`);
      }
    }

    console.log("Number of pages", senatorPages.length);

    return senatorPages;
  })
  .then((senatorPages) => {
    const mailRequests = senatorPages.map((url) => {
      return fetch(url)
        .then((result) => {
          /** @type {string} */
          const rawLocation = result.headers.get("Location");

          if (result.status === 307 && rawLocation) {
            let loc = rawLocation;
            if (rawLocation.startsWith("http:")) {
              loc = rawLocation.replace("http", "https");
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
              `Expected a redirect but the status was ${result.status} and the headers are ${result.headers}`
            );
          }
        })
        .then((data) => {
          const mailLine = data
            .split("\n")
            .filter((s) => s.includes("cnt_email"));

          if (mailLine.length !== 1) {
            throw new RangeError("There are too many matching lines, or 0.");
          }

          const address = /\s'(.*@.*)'\s/.exec(mailLine)[1];

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
          })
      );
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
