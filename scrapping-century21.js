// Importer Puppeteer
require("dotenv").config();
const puppeteer = require("puppeteer");
const fs = require("fs");
const mysql = require("mysql2");

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
    saveErrorLog(error);
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
    saveErrorLog(error);
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
    saveErrorLog(error);
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
    saveErrorLog(error);
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
    saveErrorLog(error);
    console.error("/!\\ /!\\ Error from getProperties() :", error);
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
    saveErrorLog(error);
    console.error("/!\\ /!\\ Error from getMorePropertyInformations() :", error);
  }
};

const escapeMysqlRealString = (string) => {
  return string.replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, (character) => {
    switch (character) {
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
      case "'":
        return "''"
      case "\"":
      case "\\":
      case "%":
        return "\\"+character;
      default:
        return character;
    }
  });
}

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

const checkIfPropertyIsALreadyScraped = async (property) => {
  try {
    console.log('property :', property);
    const getPropertyUrlDbQuery = `SELECT source_url FROM InvestImmo.property WHERE source_url = '${escapeMysqlRealString(property.detailUrl)}';`;

    console.log('property.detailUrl :', property.detailUrl);

    const propertyUrlDb = await query(getPropertyUrlDbQuery);

    // const isAlreadyScraped = (0 === await query(getPropertyUrlDbQuery).length);
    console.log('getPropertyUrlDbQuery :', getPropertyUrlDbQuery);
    console.log('propertyUrlDb :', propertyUrlDb);

    const isAlreadyScraped = 0 === propertyUrlDb.length;
    console.log('isAlreadyScraped :', isAlreadyScraped);

    return isAlreadyScraped;
  } catch (error) {
    saveErrorLog(error);
    console.error('/!\\ Erreur dans checkIfPropertyIsALreadyScraped : ', error);
  }
};

/**
 * Récupérer l'id de la ville de l'annonce à ajouter
 * @returns L'id de la ville
 */
const getCityDb = async (property) => {
  try {

    if ('maison' == await (property.type).toLowerCase()) {
      property.rentAverageColumnName = 'average_rent_house';
    } else {
      property.rentAverageColumnName = 'average_rent_apartment';
    }

    const getCityDbQuery = `SELECT id, ${property.rentAverageColumnName} FROM InvestImmo.city c WHERE LOWER(c.name) = LOWER('${escapeMysqlRealString(formatCityName(property.cityName))}') AND c.zipcode LIKE '${connection.escape(property.departmentCode)}%';`;

    // console.log('getCityDbQuery :', getCityDbQuery);

    const result = await query(getCityDbQuery);
    return result[0];
  } catch (error) {
    saveErrorLog(error);
    console.error('/!\\ Erreur de requête : ', error);
  }
}
  
/**
 * Récupérer l'id du type de l'annonce à ajouter
 * @returns L'id du type
 */
const getPropertyTypeId = async (property) => {
  try {
    const getPropertyTypeIdQuery = `SELECT id FROM InvestImmo.property_type pt WHERE LOWER(pt.type) = LOWER('${escapeMysqlRealString(property.type)}');`;

    const result = await query(getPropertyTypeIdQuery)
    return result[0].id;
  } catch (error) {
    saveErrorLog(error);
    console.error('/!\\ Erreur de requête : ', error);
  }
}
  
const calculateRentability = async (property) => {
  try {
    let result = 0;
    let price;
    let rent;

    price = property.price + ( 9 * property.price / 100);
    rent = property.surface * property.rentAverage;
    result = (rent * 12 * 100) / price;
    
    return result.toFixed(1);
  } catch (error) {
    saveErrorLog(error);
    console.error('/!\\ Erreur de calcul de rentabilité : ', error);
  }
}

const insertProperty = async (property) => {
  try {
    let propertyTypeId;
    let rentability = '';
    let queryInsertData = '';
    
    await getCityDb(property).then(result => {
      property.cityId = result.id;
      property.rentAverageColumnName = result[property.rentAverageColumnName];
    });
  
  
    await getPropertyTypeId(property).then(result => propertyTypeId = result);
  
    await calculateRentability(property).then(result => rentability = result);
    
    const queryInsertProperty = `INSERT INTO InvestImmo.property (source, city_id, property_type_id, surface, room_number, price, rentability, description, source_url) \nVALUES('Scraping', ${connection.escape(property.cityId)}, ${connection.escape(propertyTypeId)}, ${connection.escape(property.surface)}, ${connection.escape(property.nbRoom)}, ${connection.escape(property.price)}, ${connection.escape(rentability)}, '${escapeMysqlRealString(property.description)}', '${escapeMysqlRealString(property.detailUrl)}');\n`;
  
    let queryInsertPropertyImages = 'INSERT INTO InvestImmo.property_image (property_id, image, created_at, updated_at)\nVALUES ';
  
    for (let index = 0; index < property.images.length; index++) {
      const image = property.images[index];
      
      queryInsertPropertyImages += `(LAST_INSERT_ID(), '${escapeMysqlRealString(image)}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
  
      if ((property.images.length - 1) !== index) {
        queryInsertPropertyImages += ',\n'
      } else {
        queryInsertPropertyImages += ';\n'
      }
    }
  
    return queryInsertData = queryInsertData + queryInsertProperty + queryInsertPropertyImages;
  } catch (error) {
    saveErrorLog(error);
    console.error('/!\\ Erreur lors de la création du fichier sql : ', error);
  }
}

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
      const properties = await page.evaluate(getProperties);

      result = [...result, properties];
    }

    result = result.flat();

    let queryInsertData = '';

    // Pour chaque bien
    // Aller dans la page de détail
    // Récupérer les détails du bien
    for await (const property of result) {

      const urlPropertyDetail = property.detailUrl;
      
      // const isALreadyScraped = await checkIfPropertyIsALreadyScraped(property);
      
      // if (isALreadyScraped) {
        await goToPage(page, urlPropertyDetail);
  
        //Récupérer les informations accessibles uniquement sur la page du détail du bien
        const PropertyDetail = await page.evaluate(getMorePropertyInformations);
  
        property.description = PropertyDetail.description;
        property.images = PropertyDetail.images;
  
        connection.connect((error) => {
          try {
  
          insertProperty(property).then(result => {
            queryInsertData += result;
          });
            
          } catch (error) {
            saveErrorLog(error);
            console.error("/!\\ Erreur de requête : ", error);
          }
  
          if (error) {
            console.error("/!\\ Erreur de connexion à la bdd : ", error);
            return;
          }
        });
      // }
    }

    // Fermer le navigateur
    await closeBrowser(browser);

    // return result;
    return queryInsertData;
  } catch (error) {
    saveErrorLog(error);
    console.error("/!\\ Error from getAllProperties() :", error);
  }
};

const setFileName = (folder,baseFileName, fileExtension) => {
  const currentDatetime = new Date();
  const year = currentDatetime.getFullYear().toString();
  const month = (currentDatetime.getMonth() + 1).toString();
  const date = currentDatetime.getDate().toString();
  const hours = currentDatetime.getHours().toString();
  const minutes = currentDatetime.getMinutes().toString();
  const seconds = currentDatetime.getSeconds().toString();

  const filenameParameter = { year, month, date, hours, minutes, seconds };

  for (const parameter in filenameParameter) {
    if (
      Object.hasOwnProperty.call(filenameParameter, parameter) &&
      10 > filenameParameter[parameter]
    ) {
      filenameParameter[parameter] = "0" + filenameParameter[parameter];
    }
  }

  if (!fs.existsSync(folder)){
    fs.mkdirSync(folder);
  }

  const fileOutputName = `${folder}${baseFileName}_${filenameParameter.year}${filenameParameter.month}${filenameParameter.date}${filenameParameter.hours}${filenameParameter.minutes}${filenameParameter.seconds}.${fileExtension}`;

  return fileOutputName;
}

const saveData = async (scrapedData) => {
  const sqlFileOutput = setFileName('./data_century21/','data_century21_scraped', 'sql');

  fs.writeFile(`${sqlFileOutput}`, scrapedData, 'utf8', (error) => {
    if(error) {
      saveErrorLog(error);
      console.error('/!\\ Une erreur est survenue lors de la sauvegarde des données, elles n\'ont pas été sauvegardées dans un fichier :', error);
    }

    console.log(`Les données ont été extraites et sauvegardées avec succès ! Visualisez-les dans '${sqlFileOutput}'`);
    process.exit();
  });
};

const saveErrorLog = (errorLog) => {
  const errorLogFileOutput = setFileName('./error_log_century21/','error_log_century21_scraping', 'txt');

  fs.writeFile(`${errorLogFileOutput}`, errorLog, 'utf8', (error) => {
    if(error) {
      saveErrorLog(error);
      console.error('/!\\ Erreur lors de la sauvegarde du message d\'erreur', error);
    }

    console.log(`Erreur sauvegardé dans '${errorLogFileOutput}'`);
    process.exit();
  });
}

(
  async () => {
    console.time("Scraping ");
    const data = await getAllProperties();

    if ('' == data) {
      const message = 'Aucun bien a été trouvé.';
      saveErrorLog(message);
      console.error('/!\\ Error : ',message);
    } else {
      saveData(data);
    };

    console.timeEnd("Scraping ");
  }
)();
