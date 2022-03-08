// Importer Puppeteer
const puppeteer = require("puppeteer");

(async () => {
  // Lancer un navigateur et ouvrir une page
  try {
    const url = "https://www.century21.fr/annonces/f/achat/d-94_val_de_marne/";
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    let allUrls = [];
    let allProperties = [];
    let nbLastPage;

    // Aller à la page souhaitée
    await page.goto(url, { waitUntil: "networkidle2" });

    // Refuser les cookies
    await page.click('div[data-actions^="deny-all"]');

    /**
     * Récupérer le nombre totale de pages
     */
    const getNbPages = await page.evaluate(() => {
      // Pagination
      const urls = document.querySelectorAll(
        ".c-the-pagination-bar ul.tw-flex.tw-justify-center"
      )[0].children;
      nbLastPage = urls[urls.length - 1].innerText;
    });

    getNbPages;
    /**
     * Récupérer les urls de toutes les pages de la recherche dans la pagination
     */
    const getUrlsPages = await page.evaluate(() => {
      let pagesUrls = [];
      for (let i = 1; i <= nbLastPage; i++) {
        if (i > 1) {
          pagesUrls.push(
            `https://www.century21.fr/annonces/f/achat/d-94_val_de_marne/page-${i}`
          );
        } else {
          pagesUrls.push(
            "https://www.century21.fr/annonces/f/achat/d-94_val_de_marne/"
          );
        }
        console.log("pagesUrls :", pagesUrls);
      }

      return pagesUrls;
    });

    allUrls = [...getUrlsPages];

    /**
     * 
     * @returns Les biens de la page
     */
    const fetchProperties = () => {
      let properties = [];

      const propertiesScrapped = document.querySelectorAll(
        ".c-the-property-thumbnail-with-content"
      );

      propertiesScrapped.forEach((propertyScrapped) => {
        let infos = [];
        let info;
        let propertyType;
        let propertyPrice;
        let propertyCityName;
        let propertySurface;
        let propertyNbRoom;
        let propertyImage;

        propertyScrapped
          .querySelectorAll(".c-text-theme-heading-4")
          .forEach((element) => {
            for (var value of element.childNodes.values()) {
              // Get data
              if (value.nodeName == "#text") {
                info = value;
                info = info.textContent;
                info = info.replaceAll("\n", "");
                info = info.trim();
                info = info.replaceAll(/\s+/g, " ");
                infos.push(info);
              }
            }

            // Delete unless data
            infos.pop();

            // Formater les données recueilli
            propertyCityName = infos[0].replace(/\s[0-9]+$/g, "");
            propertySurface = infos[1].replace(" m", "").replace(',','.');
            propertyNbRoom = infos[2].replace(/^,\s/g, "").replace(/(pièce|s)/g, "");

            propertyType = propertyScrapped.querySelector(".c-text-theme-heading-3.tw-tracking-c21-theme-0.tw-leading-none.tw-text-c21-grey-darker")
            .innerText;
            propertyPrice = propertyScrapped.querySelector(".c-text-theme-heading-1").innerText.replace('€', '').replace(/\s/, '').trim();
            propertyDescription = propertyScrapped.querySelector(".c-text-theme-base").innerText;

            hasSrcImage = propertyScrapped.querySelector('img.tw-absolute').hasAttribute('src');

            if (hasSrcImage) {
              propertyImage = propertyScrapped.querySelector('img.tw-absolute').getAttribute('src');
            } else {
              propertyImage = propertyScrapped.querySelector('img.tw-absolute').getAttribute('data-src');
            }

            properties.push({
              cityName: propertyCityName,
              surface: Number(propertySurface),
              nbRoom: Number(propertyNbRoom),
              price: Number(propertyPrice), // prix formaté
              type: propertyType.slice(0, propertyType.indexOf(' ')),
              description: propertyDescription,
              image: `https://www.century21.fr${propertyImage}`
            });
          });
      });
      return properties;
    };

    for (let index = 0; index < 2; index++) {
      const url = allUrls[index];

      // Aller à la page souhaitée
      await page.goto(url, { waitUntil: "networkidle2" });

      // Refuser les cookies
      await page.click('div[data-actions^="deny-all"]');

      allProperties.push(await page.evaluate(fetchProperties));
    }
    allProperties = allProperties.flat();
    console.log("allProperties :", allProperties);
    console.log("allProperties :", allProperties.length);
  } catch (error) {
    console.error(error);
  }

  // Fermer le navigateur
  // await browser.close();
})();
/* 
x city_id
x description
x surface
x price
address_street
floor
x room_number
source_url
*/
