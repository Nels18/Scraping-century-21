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

    let queriesData = '';

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
          const getCityDb = async () => {
            try {
              let rentColumnAverage = 'average_rent_apartment';

              if ('maison' == property.type.toLowerCase()) {
                rentColumnAverage = 'average_rent_house';
              }

              const getCityDbQuery = `SELECT id, ${rentColumnAverage} FROM InvestImmo.city c WHERE LOWER(c.name) = LOWER(${connection.escape(formatCityName(dbCityName))}) AND c.zipcode LIKE '${connection.escape(property.departmentCode)}%';`;

              const result = await query(getCityDbQuery)
              return result[0];
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

          const calculateRentability = async (property) => {
            try {
              let rentAverage;
              let nameRentAevrageColumn;
              let result = 0;
              let price;
              let rent;
  
              if ('maison' == await (property.type).toLowerCase()) {
                nameRentAevrageColumn = 'average_rent_house';
              } else {
                nameRentAevrageColumn = 'average_rent_apartment';
              }

              await getCityDb().then(res => rentAverage = res[nameRentAevrageColumn]);

              console.log('start');
              price = property.price + ( 9 * property.price / 100);
              console.log('property.price :', property.price);
              console.log('price :', price);
              rent = property.surface * rentAverage;
              console.log('property.surface :', property.surface);
              console.log('rentAverage :', rentAverage);
              console.log('rent :', rent);
              result = (rent * 12 * 100) / price;
              console.log('result :', result);
              console.log('end');
              
              return result.toFixed(1);
            } catch (error) {
              console.error('Erreur de calcul de rentabilité : ', error);
            }
          }


          const mysql_real_escape_string = (str) => {
            return str.replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, function (char) {
              switch (char) {
                case "\0":
                  return "\\0";
                case "\x08":
                  return "\\b";
                case "\x09":
                  return "\\t";
                case "\x1a":
                  return "\\z";
                case "\n":
                  return "\\n";
                case "\r":
                  return "\\r";
                case "\"":
                case "'":
                case "\\":
                case "%":
                  return "\\"+char;
                default:
                  return char;
              }
            });
          }
          
          const insertProperty = async () => {
            let cityId;
            let propertyTypeId;
            let rentability = '';
            
            await getCityDb().then(result => cityId = result.id);

            await getPropertyTypeId().then(result => propertyTypeId = result);
            // calculateRentability(property).then(result => console.log('result :', result));

            await calculateRentability(property).then(result => rentability = result);
            // console.log('rentability :', rentability);
            
            const addProperty = `INSERT INTO InvestImmo.property (source, city_id, property_type_id, surface, room_number, price, rentability, description, source_url) \nVALUES('Scraping', ${connection.escape(cityId)}, ${connection.escape(propertyTypeId)}, ${connection.escape(property.surface)}, ${connection.escape(property.nbRoom)}, ${connection.escape(property.price)}, ${connection.escape(rentability)}, ${connection.escape(mysql_real_escape_string(property.description))}, ${connection.escape(mysql_real_escape_string(property.detailUrl))});\n`;
        
            let addPropertyImages = 'INSERT INTO InvestImmo.property_image (property_id, image, created_at, updated_at)\nVALUES ';

            for (let index = 0; index < property.images.length; index++) {
              const image = property.images[index];
              
              addPropertyImages += `(LAST_INSERT_ID(), ${connection.escape(mysql_real_escape_string(image))}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;

              // console.log('index :', index);
              // console.log('property.images.length :', property.images.length);
              // console.log('(property.images.length - 1) == index :', (property.images.length - 1) == index);

              if ((property.images.length - 1) !== index) {
                addPropertyImages += ',\n'
              } else {
                addPropertyImages += ';\n'
              }
            }

            // console.log('cityId :', cityId);
            // console.log('propertyTypeId :', propertyTypeId);
            // console.log('*** INSERT *** :', addProperty, addPropertyImages);

            queriesData = queriesData + addProperty + addPropertyImages;

          }

          insertProperty();
          getCityDb();
          
        } catch (error) {
          console.log("Erreur de requête : ", error);
        }

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

    // return result;
    return queriesData;
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

  // const jsonFileOutput = `data_century21_scraped_${filenameParameter.year}${filenameParameter.month}${filenameParameter.date}${filenameParameter.hours}${filenameParameter.minutes}${filenameParameter.seconds}.json`;

  const sqlFileOutput = `data_century21_scraped_${filenameParameter.year}${filenameParameter.month}${filenameParameter.date}${filenameParameter.hours}${filenameParameter.minutes}${filenameParameter.seconds}.sql`;

  // fs.writeFile(
  //   // `./data_century21/${jsonFileOutput}`,
  //   // JSON.stringify(scrapedData),
  //   `./data_century21/${sqlFileOutput}`,
  //   JSON.stringify(scrapedData),
  //   "utf8",
  //   function (error) {
  //     if (error) {
  //       return console.log(error);
  //     }
  //     console.log(
  //       // `Les données ont été extraites et sauvegardées avec succès ! Visualisez-les dans './data_century21/${jsonFileOutput}'`
  //       `Les données ont été extraites et sauvegardées avec succès ! Visualisez-les dans './data_century21/${sqlFileOutput}'`
  //     );
  //   }
  // );
  fs.writeFile(`./data_century21/${sqlFileOutput}`, scrapedData, 'utf8', (error) => {
    if(error) {
      return console.log(error);
    }
      console.log(`Les données ont été extraites et sauvegardées avec succès ! Visualisez-les dans './data_century21/${sqlFileOutput}'`);
      process.exit();
  });
};

(
  async () => {
    console.time("Scraping ");
    const data = await getAllProperties();
    await saveData(data);
    console.timeEnd("Scraping ");
  }
)();
