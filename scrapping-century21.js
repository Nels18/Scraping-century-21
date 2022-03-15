// Importer Puppeteer
const puppeteer = require("puppeteer");

// Liste des urls des départements de recherche
const urlsLocation = [
  // "v-paris/",
  // "d-78_yvelines/",
  // "d-91_essonne/",
  // "d-92_hauts_de_seine/",
  // "d-93_seine_saint_denis/",
  "d-94_val_de_marne/",
  // "d-95_val_d_oise/",
];

/**
 *
 * @param {puppeteer.Page} page
 * @param {string} url
 */
const goToPage = async (page, url) => {
  try {
    // Aller à la page souhaitée
    await page.goto(url, { waitUntil: "networkidle2" });

    // Refuser éventuellement les cookies
    const denyCookiesBtn = 'div[data-actions^="deny-all"]';

    if (page.$(denyCookiesBtn)) {
      await page.click(denyCookiesBtn);
    }
  } catch (error) {
    console.error("/!\\ Error from goToPage() :", error);
  }
};

/**
 *
 * @param {puppeteer.Page} page
 * @param {string} url
 * @returns Toutes les urls des pages de résultats de la recherche
 */
const getUrlsPages = async (page, url) => {
  try {
    await goToPage(page, url);

    return await page.evaluate(async (url) => {
      let result = [];

      // Pagination
      const urlsPagination = document.querySelectorAll(
        ".c-the-pagination-bar ul.tw-flex.tw-justify-center"
      )[0].children;

      // Récupérer le totale de pages
      nbPages = urlsPagination[urlsPagination.length - 1].innerText;

      // Génération des url en fonction du nombre de page
      for (let index = 1; index <= nbPages; index++) {
        if (index > 1) {
          result.push(`${url}page-${index}`);
        } else {
          result.push(url);
        }
      }

      return result;
    }, url);
  } catch (error) {
    console.error("/!\\ Error from getUrlsPages() :", error);
  }
};

/**
 * Récupérer les urls de toutes les pages de la recherche dans la pagination
 * @param {puppeteer.Page} page
 * @param {string} urlFull
 * @returns
 */
const getPagesForEachLocation = async (page, urlFull) => {
  try {
    // Récupérer les urls de toutes les pages de la recherche dans la pagination
    const result = getUrlsPages(page, urlFull);

    return result;
  } catch (error) {
    console.error("/!\\ Error from getPagesForEachLocation() :", error);
  }
};

/**
 * Récupère les pages à scraper
 * @returns Les pages à scraper
 */
const getPagesToScrap = async (browser) => {
  try {
    let allUrls = [];

    // Récupérer les url de toutes les pages pour chaque département
    for (let index = 0; index < urlsLocation.length; index++) {
      const url = urlsLocation[index];

      const page = await browser.newPage();

      urlFull = `https://www.century21.fr/annonces/f/achat/${url}`;

      allUrls[index] = await getPagesForEachLocation(page, urlFull);

      page.close;
    }

    let result = allUrls.flat();

    return result;
  } catch (error) {
    console.error("/!\\ Error from getPagesToScrap() :", error);
  }
};

/**
 * Récupérer les biens d'une page
 * @returns Les biens scrapés de la page
 */
const getProperties = async () => {
  try {
    let result = [];

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
      // let propertyImage;
      let propertyDetailUrl;

      propertyScrapped
        .querySelectorAll(".c-text-theme-heading-4")
        .forEach(async (element) => {
          for await (const value of element.childNodes.values()) {
            // Get data
            if (value.nodeName == "#text") {
              info = value;
              info = info.textContent;
              info = info.replaceAll("\n", "");
              info = info.trim();
              info = info.replaceAll(/\s+/g, " ");
              infos.push(await info);
            }
          }

          // Suppression de donnée inutile (référence)
          infos.pop();

          // Formater les données recueilli
          propertyCityName = infos[0].replace(/\s[0-9]+$/g, ""); // Suppression du code département
          propertySurface = infos[1].replace(" m", "").replace(",", "."); // Suppression de l'unité
          propertyNbRoom = infos[2]
            .replace(/^,\s/g, "")
            .replace(/(pièce|s)/g, ""); // Récupération du nombre

          propertyType = await propertyScrapped.querySelector(
            ".c-text-theme-heading-3.tw-leading-none.tw-text-c21-grey-darker"
          ).innerText;
          propertyPrice = await propertyScrapped
            .querySelector(
              ".c-text-theme-heading-1.is-constant-size-on-mobile.tw-mt-2.tw-whitespace-nowrap"
            )
            .innerText.replace("€", "")
            .replace(/\s/g, "")
            .trim(); // Suppression de l'unité

          propertyDetailUrl = propertyScrapped
            .querySelector("a")
            .getAttribute("href");
          propertyDetailUrl =
            `https://www.century21.fr${propertyDetailUrl}`;

          result.push({
            cityName: propertyCityName,
            surface: Number(propertySurface),
            nbRoom: Number(propertyNbRoom),
            price: Number(propertyPrice),
            type: propertyType.slice(0, propertyType.indexOf(" ")), // Récupération du type uniqument
            detailUrl: propertyDetailUrl,
          });
        });
    });

    return result;
  } catch (error) {
    console.error("/!\\ Error from getProperties() :", error);
  }
};

/**
 * Récupère les informations accessibles uniquement sur la page du détail du bien
 * @returns La description complète et les photos du bien
 */
const getMorePropertyInformations = async () => {
  try {
    let propertyDetailInformations = {};
    propertyDetailInformations.images = [];

    propertyDetailInformations.description = await document.querySelector(
      ".has-formated-text"
    ).innerText;
    propertyDetailInformations.description =
      propertyDetailInformations.description.replaceAll("\n", "");

    const propertyImagesNodelist = document.querySelectorAll(
      ".c-the-detail-images__item img"
    );

    for await (const propertyImageNodeChild of propertyImagesNodelist) {
      const hasSrcImage = propertyImageNodeChild.hasAttribute("src");
      let image;

      if (hasSrcImage) {
        image = propertyImageNodeChild.getAttribute("src");
      } else {
        image = propertyImageNodeChild.getAttribute("data-src");
      }

      image = `https://www.century21.fr${image}`;
      propertyDetailInformations.images.push(image);
    }

    return propertyDetailInformations;
  } catch (error) {
    console.error("/!\\ Error from getMorePropertyInformations() :", error);
  }
};

/**
 * Récupérer tous les biens des départements recherchés
 * @returns Tous les biens scrapés
 */
const getAllProperties = async () => {
  try {
    const browser = await puppeteer.launch();
    // const browser = await puppeteer.launch({ headless: false });

    //Récupérer toutes les pages à scraper
    const pagesToScrap = await getPagesToScrap(browser);
    const page = await browser.newPage();
    let result = [];
    
    // Pour chaque page
    // Récupérer les infos des biens de la page
    for await (let urlPageToScrap of pagesToScrap) {
      await goToPage(page, urlPageToScrap);
      
      // Récupérer les biens d'une page
      const property = await page.evaluate(getProperties);
      result = [...result, property];
      console.log('urlPageToScrap :', urlPageToScrap);
    }
    
    result = result.flat();
    
    // Pour chaque bien
    // Aller dans la page de détail
    // Récupérer les détails du bien
    for await (const property of result) {
      const urlPropertyDetail = property.detailUrl;
      await goToPage(page, urlPropertyDetail);

      //Récupérer les informations accessibles uniquement sur la page du détail du bien
      const PropertyDetail = await page.evaluate(getMorePropertyInformations);
      property.description = PropertyDetail.description;
      property.images = PropertyDetail.images;
      console.log('urlPropertyDetail :', urlPropertyDetail);
    }

    return result;
  } catch (error) {
    console.error("/!\\ Error from getAllProperties() :", error);
  }
};

(async () => {
  const data = await getAllProperties();

  console.log("data :", data.length);
})();

  // Fermer le navigateur
  // await browser.close();