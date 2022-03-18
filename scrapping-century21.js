// Importer Puppeteer
require("dotenv").config();
const puppeteer = require("puppeteer");
const fs = require("fs");
const mysql = require("mysql2"); //mysql connector

//connect to MySQL
const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  user: process.env.DB_USER,
});

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

const getBrowser = async () => {
  let browser;

  try {
    console.log("Opening the browser......");
    browser = await puppeteer.launch();
    // browser = await puppeteer.launch({headless: false});
  } catch (err) {
    console.log("Could not create a browser instance => : ", err);
  }

  return browser;
};

const closeBrowser = async (browser) => {
  try {
    console.log("Closing the browser......");
    await browser.close();
  } catch (err) {
    console.log("Could not close browser instance => : ", err);
  }
};

/**
 *
 * @param {puppeteer.Page} page
 * @param {string} url
 */
const goToPage = async (page, url) => {
  try {
    // Aller à la page souhaitée
    console.log(`Navigating to : ${url}`);
    await page.goto(url, { waitUntil: "networkidle2" });

    // Refuser éventuellement les cookies
    const denyCookiesBtn = 'div[data-actions^="deny-all"]';

    if (page.$(denyCookiesBtn)) {
      await page.click(denyCookiesBtn);
    }
  } catch (error) {
    console.error("/!\\ Error from goToPage() :", error);
    return;
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
    const result = await getUrlsPages(page, urlFull);

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

      // urlFull = `https://www.century21.fr/trouver_logement/detail/2445016438/`;
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
          departmentCode = infos[0].replace(/[a-z A-Z]/g, "");
          propertySurface = infos[1].replace(" m", "").replace(",", "."); // Suppression de l'unité
          // departmentCode = propertyCityName.replace(/^[a-z A-Z]/g, "");
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
          propertyDetailUrl = `https://www.century21.fr${propertyDetailUrl}`;

          result.push({
            cityName: propertyCityName,
            surface: Number(propertySurface),
            nbRoom: Number(propertyNbRoom),
            price: Number(propertyPrice),
            departmentCode: Number(departmentCode),
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
    const browser = await getBrowser();
    // const browser = await puppeteer.launch({ headless: false });

    //Récupérer toutes les pages à scraper
    const pagesToScrap = await getPagesToScrap(browser);
    const page = await browser.newPage();
    let result = [];

    // Pour chaque page
    // Récupérer les infos des biens de la page
    // for await (let urlPageToScrap of pagesToScrap) {
    for (let index = 1; index < 2; index++) {
      // await goToPage(page, urlPageToScrap);
      await goToPage(page, pagesToScrap[index]);

      // Récupérer les biens d'une page
      const property = await page.evaluate(getProperties);

      result = [...result, property];
    }

    result = result.flat();

    // Pour chaque bien
    // Aller dans la page de détail
    // Récupérer les détails du bien
    for await (const property of result) {
      let dbCityName = property.cityName;

      const formatCityName = (string) => {
        const accentedChar = {
          à: "a",
          á: "a",
          â: "a",
          ã: "a",
          ä: "a",
          å: "a",
          ò: "o",
          ó: "o",
          ô: "o",
          õ: "o",
          ö: "o",
          ø: "o",
          è: "e",
          é: "e",
          ê: "e",
          ë: "e",
          ç: "c",
          ì: "i",
          í: "i",
          î: "i",
          ï: "i",
          ù: "u",
          ú: "u",
          û: "u",
          ü: "u",
          ÿ: "y",
          ñ: "n",
          "-": " ",
          _: " ",
        };
        let result = "";
        for (let index = 0; index < string.length; index++) {
          const char = string[index];
          
          const newChar = accentedChar[char.toLowerCase()];
          if (accentedChar[char.toLowerCase()]) {
            result = result + newChar;
          } else {
            result = result + char.toLowerCase();
          }
        }
      
        result = result.split(" ").join("-");
        result = result.replace(/^(st-)/,"saint-");
        result = result.replace(/(-st-)/,"-saint-");      
        string = result;
      
        return string;
      };

      // let sqlData = '';

      // fs.writeFile(
      //   `./data_century21/data.sql`,
      //   sqlData,
      //   "utf8",
      //   function (error) {
      //     if (error) {
      //       return console.log(error);
      //     }
      //     console.log(
      //       `Les données ont été extraites et sauvegardées avec succès ! Visualisez-les dans './data_century21/${fileOutput}'`
      //     );
      //   }
      // );
      const urlPropertyDetail = property.detailUrl;
      await goToPage(page, urlPropertyDetail);

      //Récupérer les informations accessibles uniquement sur la page du détail du bien
      const PropertyDetail = await page.evaluate(getMorePropertyInformations);

      property.description = PropertyDetail.description;
      property.images = PropertyDetail.images;

      connection.connect((error) => {
        
        try {
          /**
           * Faire des requête à la bdd
           * @param {*} sql Requête sql
           * @returns Une promesse contenant le résultat de la requete
           */
          const query = (sql) => {
            return new Promise((resolve, reject) => {
              connection.query(sql, (error, results) => {
                if (error) return reject(error);
                resolve(results);
              });
            })
          }

          /**
           * Récupérer l'id de la ville de l'annonce à ajouter
           * @returns L'id de la ville
           */
          const getCityId = async () => {
            try {
              const getCityIdQuery = `SELECT id FROM InvestImmo.city c WHERE LOWER(c.name) = LOWER(${connection.escape(formatCityName(dbCityName))}) AND c.zipcode LIKE '${connection.escape(property.departmentCode)}%';`;

              const result = await query(getCityIdQuery)
              return result[0].id;
            } catch (error) {
              console.error('Erreur de requête : ', error);
            }
          }

          /**
           * Récupérer l'id du type de l'annonce à ajouter
           * @returns L'id du type
           */
          const getPropertyTypeId = async () => {
            try {
              const getPropertyTypeIdQuery = `SELECT id FROM InvestImmo.property_type pt WHERE LOWER(pt.type) = LOWER(${connection.escape(property.type)});`;

              const result = await query(getPropertyTypeIdQuery)
              return result[0].id;
            } catch (error) {
              console.error('Erreur de requête : ', error);
            }
          }
          
          const insertProperty = async () => {
            let cityId;
            let propertyTypeId;
            
            await getCityId().then(res => cityId = res);
            await getPropertyTypeId().then(res => propertyTypeId = res);
            
            const addProperty = `INSERT INTO InvestImmo.property (city_id, property_type_id, surface, room_number, price, description) VALUES(${connection.escape(cityId)}, ${connection.escape(propertyTypeId)}, ${connection.escape(property.surface)}, ${connection.escape(property.nbRoom)}, ${connection.escape(property.price)}, ${connection.escape(property.description)})`;
            

            console.log('cityId :', cityId);
            console.log('propertyTypeId :', propertyTypeId);
            console.log('addProperty :', addProperty);

          }

          insertProperty();
          
        } catch (error) {
          console.log("Erreur de requête : ", error);
        }
        
        let addPropertyImages = '';

        property.images.forEach(image => {
          addPropertyImages += `INSERT INTO InvestImmo.property_image (property_id, image, created_at, updated_at) VALUES (LAST_INSERT_ID(), ${connection.escape(image)}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);\n`;
        });
        // console.log('addPropertyImages :', addPropertyImages);

        // connection.query(addPropertyImages, function (error, result) {
        //   if (error) {
        //     console.log('Erreur de requête : ', error);
        //     return;
        //   }
        //   console.log('Requête réussie :',result);
        // });

        if (error) {
          console.log("Erreur de connexion à la bdd : ", error);
          return;
        }
      });
    }

    // Fermer le navigateur
    await closeBrowser(browser);

    return result;
  } catch (error) {
    console.error("/!\\ Error from getAllProperties() :", error);
  }
};

const saveData = async (scrapedData) => {
  const currentDatetime = new Date();
  let year = currentDatetime.getFullYear().toString();
  let month = (currentDatetime.getMonth() + 1).toString();
  let date = currentDatetime.getDate().toString();
  let hours = currentDatetime.getHours().toString();
  let minutes = currentDatetime.getMinutes().toString();
  let seconds = currentDatetime.getSeconds().toString();

  let filenameParameter = { year, month, date, hours, minutes, seconds };

  for (const parameter in filenameParameter) {
    if (
      Object.hasOwnProperty.call(filenameParameter, parameter) &&
      10 > filenameParameter[parameter]
    ) {
      filenameParameter[parameter] = "0" + filenameParameter[parameter];
    }
  }

  const fileOutput = `data_century21_scraped_${filenameParameter.year}${filenameParameter.month}${filenameParameter.date}${filenameParameter.hours}${filenameParameter.minutes}${filenameParameter.seconds}.json`;

  fs.writeFile(
    `./data_century21/${fileOutput}`,
    JSON.stringify(scrapedData),
    "utf8",
    function (error) {
      if (error) {
        return console.log(error);
      }
      console.log(
        `Les données ont été extraites et sauvegardées avec succès ! Visualisez-les dans './data_century21/${fileOutput}'`
      );
    }
  );
};

(async () => {
  console.time("Scraping ");
  const data = await getAllProperties();
  // const data = [
  //   {
  //     cityName: 'CHOISY LE ROI',
  //     surface: 12.99,
  //     nbRoom: 1,
  //     price: 103000,
  //     type: 'Appartement',
  //     detailUrl: 'https://www.century21.fr/trouver_logement/detail/2689813335/',
  //     description: `SAINT LOUIS.Dans une résidence de standing très bien entretenue, avec gardien, à proximité des commerces et des transports : bus 183, Tramway T9 et RER C "Choisy le Roi" à 10 min à pied. Venez découvrir ce studio comprenant : une entrée avec placard, un séjour avec un coin cuisine, une salle d'eau avec WC et un balcon.Idéal investisseur!`,
  //     images: [
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_25899_8_A1037563-B18F-4F16-B1C5-925A82E93482.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_25899_8_0705A9E3-0ACE-4031-AE8D-0BAF14FEC6FB.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_25899_8_DBF955EE-F690-4B52-8CE8-7052EA6F1BE7.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_25899_8_66B1477C-6D44-4272-95D0-49658AEBA68A.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_25899_8_761E132E-3720-4665-985C-15B8352C9FBB.jpg'
  //     ]
  //   },
  //   {
  //     cityName: 'CHOISY LE ROI',
  //     surface: 131,
  //     nbRoom: 5,
  //     price: 499000,
  //     type: 'Maison',
  //     detailUrl: 'https://www.century21.fr/trouver_logement/detail/2821029008/',
  //     description: "Quartier Parc de la Mairie.Au sein d'un quartier pavillonnaire à 200 mètres du nouveau Tram T9, nous vous proposons cette belle maison de 5 pièces principales.L'accueil se fait par une véranda donnant sur le jardin exposé plein Sud. Le séjour est pourvu d'une cheminée, la cuisine attenante est entièrement aménagée.Sur le même niveau se trouve également une salle de bains avec WC.A l'étage un grand palier avec rangement distribue deux chambres donnant sur le jardin au calme et une salle d'eau avec WC.Au deuxième niveau vous attend un grand bureau et une chambre de 14 m².L'espace extérieur exposé au Sud permet de profiter des beaux jours et de stationner au moins deux véhicules.Pour les commodités, écoles et commerces sont à proximité immédiate et la gare RER C est à 1.200 mètres ainsi que le TVM.",
  //     images: [
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_26044_8_2E57B841-491F-4A9F-9DE6-89DEB130A5FE.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_26044_8_D2264F13-A2FD-4135-B72C-FAF505912CCF.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_26044_8_429D9843-3991-4C59-8095-F2E2EBDDD5A0.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_26044_8_2E8C852B-FE53-49AC-BFF7-910CAF0F391A.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_26044_8_7E143BFE-B013-4EC0-AF4B-C995FC4FC903.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_26044_8_B6CCC10A-2915-4D1D-BAF1-489DC2E7861A.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_26044_8_EDFC411B-EA80-4763-AC25-9DC13752C520.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_26044_8_9D755213-B090-4E69-94D3-BCE2BF7C46C4.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_26044_8_5BD85A25-2F56-4BF4-9738-7C8499FBBE3A.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_26044_8_FD744033-760A-4921-B434-1482414A78A7.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_26044_8_9ED6642B-9CEA-4A1B-8B8E-1C744E557EAD.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_26044_8_A56D60D0-3D9C-4644-8679-62DCB3C5D7F4.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_26044_8_5E19A4A1-2F81-4A8D-99DD-B42FA80227B6.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_26044_8_128BD1A6-B176-4F0C-8F67-6CDEF2B40177.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_26044_8_6B80B564-C112-4D62-8EE7-09396596D470.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_26044_8_774ED581-DD5D-4879-8934-DF1C9B8BC632.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_26044_8_6F2803C9-E0F2-43DC-BC9B-F083A26D5F9F.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_26044_8_584E25B9-626B-4BE4-8637-C6FD4CAB5D1E.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_26044_8_ECC88783-B3BF-4D6E-A2D0-D5B24F5D765E.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_26044_8_80213695-19BB-45B1-9706-B29ED389E26C.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_26044_8_5CFF2153-57E6-41B4-A76D-872C1625B603.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_26044_8_ACD70704-B47D-4115-BF54-87C5AD103BFC.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_26044_8_485501EE-310C-47D8-A8C8-82EAD600ABC6.jpg'
  //     ]
  //   },
  //   {
  //     cityName: 'CHOISY LE ROI',
  //     surface: 36.83,
  //     nbRoom: 2,
  //     price: 197500,
  //     type: 'Appartement',
  //     detailUrl: 'https://www.century21.fr/trouver_logement/detail/2810783935/',
  //     description: "Choisy le roi dans le quartier des gondoles nord, venez visiter cet appartement de type F2 au 3ème et dernier étage sans ascenseur. Il se compose d'une entrée avec rangements, une pièce de vie avec cuisine ouverte menant sur un balcon de 5m² exposé sud, et une chambre. Une place de stationnement privative. Résidence récente de 2002 avec de faibles charges et très bien entretenue.",
  //     images: [
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_26017_8_539F7C18-E0BA-4525-9F8D-5FE8244C0E7A.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_26017_8_0009EA48-8841-481F-8F67-3204FB28697B.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_26017_8_683B6F00-DE72-4553-898C-7E3E9886B759.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_26017_8_6A312E77-75A2-4C04-91DC-C1BFBC2F3743.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_26017_8_B38F6E87-C23F-4CD1-BDA5-4E53BA59DD41.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_26017_8_0BB3EEE1-B513-4C97-A405-C1FFB98E9E21.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_26017_8_653C7B06-D7F7-4FB2-BC2D-289AF0BAD465.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_26017_8_5E8E6CA7-2D91-4B55-BC9C-D7DDFB8C9D9D.jpg',
  //       'https://www.century21.fr/imagesBien/s3/202/3094/c21_202_3094_26017_8_3ADDDC9A-F0A0-4762-A1A4-0E6842568615.jpg'
  //     ]
  //   }
  // ];

  console.log("data :", data.length);
  saveData(data);
  console.timeEnd("Scraping ");
  process.exit();
})();
