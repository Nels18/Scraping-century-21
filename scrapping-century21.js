// Importer Puppeteer
const puppeteer = require("puppeteer");


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
        console.error('/!\\ Error from goToPage() :',error);
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
          const urlsPagination = document.querySelectorAll(".c-the-pagination-bar ul.tw-flex.tw-justify-center")[0].children;

          console.log('urlsPagination :', urlsPagination);

          // nombre totale de pages
          nbPages = urlsPagination[urlsPagination.length - 1].innerText;

          // Génération des url en fonction du nombre de page
          for (let i = 1; i <= nbPages; i++) {
            if (i > 1) {
              result.push(
                `${url}page-${i}`
              );
            } else {
              result.push(url);
            }
          }
          console.log("result :", result);

          return result;
        }, url);
      } catch (error) {
        console.error('/!\\ Error from getUrlsPages() :',error);
      }
    };

    // Pour chaque url de département
    // Récupérer le max de pages

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
        
        // Fermer le navigateur
        // await browser.close();
    }

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
        console.error('/!\\ Error from getPagesToScrap() :',error);
      }
    };


    /**
     * Récupérer les biens d'une page
     * @returns Les biens scrapés de la page
     */
    const getProperties = async () => {
      try {        
        let result = [];
  
        const propertiesScrapped = await document.querySelectorAll(".c-the-property-thumbnail-with-content");
  
        propertiesScrapped.forEach((propertyScrapped) => {
          let infos = [];
          let info;
          let propertyType;
          let propertyPrice;
          let propertyCityName;
          let propertySurface;
          let propertyNbRoom;
          let propertyImage;
          let propertyDetailUrl;
  
          propertyScrapped.querySelectorAll(".c-text-theme-heading-4")
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
  
            // Suppression de donnée inutile (référence)
            infos.pop();
  
            // Formater les données recueilli
            propertyCityName = infos[0].replace(/\s[0-9]+$/g, ""); // Suppression du code département
            propertySurface = infos[1].replace(" m", "").replace(',','.'); // Suppression de l'unité
            propertyNbRoom = infos[2].replace(/^,\s/g, "").replace(/(pièce|s)/g, ""); // Récupération du nombre
  
            propertyType = propertyScrapped.querySelector(".c-text-theme-heading-3.tw-leading-none.tw-text-c21-grey-darker")
            .innerText;
            propertyPrice = propertyScrapped.querySelector(".c-text-theme-heading-1").innerText.replace('€', '').replace(/\s/, '').trim(); // Suppression de l'unité
            propertyDescription = propertyScrapped.querySelector(".c-text-theme-base").innerText;
  
            hasSrcImage = propertyScrapped.querySelector('img.tw-absolute').hasAttribute('src');
  
            if (hasSrcImage) {
              propertyImage = propertyScrapped.querySelector('img.tw-absolute').getAttribute('src');
            } else {
              propertyImage = propertyScrapped.querySelector('img.tw-absolute').getAttribute('data-src');
            }
  
            propertyImage = `https://www.century21.fr${propertyImage}`;
  
            propertyDetailUrl = propertyScrapped.querySelector('a').getAttribute('href');
            propertyDetailUrl = `https://www.century21.fr${propertyDetailUrl}`;
  
            // page.goto(propertyDetailUrl, { waitUntil: "networkidle2" });
  
            result.push({
              cityName: propertyCityName,
              surface: Number(propertySurface),
              nbRoom: Number(propertyNbRoom),
              price: Number(propertyPrice),
              type: propertyType.slice(0, propertyType.indexOf(' ')), // Récupération du type uniqument
              description: propertyDescription,
              image: propertyImage,
              detailUrl: propertyDetailUrl
            });
          });
        });
  
        return result;
      } catch (error) {
        console.error('/!\\ Error from getProperties() :',error);
      }
    };

    /**
     * Récupérer tous les biens des départements recherchés
     * @returns Tous les biens scrapés
     */
    const getAllProperties = async () => {
      try {
        // const browser = await puppeteer.launch({ headless: false });
        const browser = await puppeteer.launch();
        const pagesToScrap = await getPagesToScrap(browser);
        const page = await browser.newPage();
        let result = [];
        
        for (let index = 0; index < pagesToScrap.length; index++) {
          const urlPageToScrap = pagesToScrap[index];
          await goToPage(page, urlPageToScrap);
          result[index] = await page.evaluate(getProperties);
        }

        result = result.flat();
        console.log('result.length :', result.length);
        return result;
      } catch (error) {
        console.error('/!\\ Error from getAllProperties() :',error);
      }
    }

    getAllProperties();
    
    // Pour chaque page
    // Récupérer les infos des biens de la page

    // Pour chaque bien
    // Aller dans la page de détail
    // Récupérer les détails du bien

