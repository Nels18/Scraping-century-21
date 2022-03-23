// Importer Puppeteer
require("dotenv").config();
const puppeteer = require("puppeteer");
const fs = require("fs");
const mysql = require("mysql2");
const cron = require('node-cron');

//connect to MySQL
const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  user: process.env.DB_USER,
  multipleStatements: true
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

/**
 * Ouvrir un navigateur
 * @returns {puppeteer.browser} Un navigateur
 */
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

/**
 * Fermer le navigateur en cours
 * @param {puppeteer.browser} browser 
 */
const closeBrowser = async (browser) => {
  try {
    console.log("Closing the browser......");
    await browser.close();
  } catch (err) {
    console.log("Could not close browser instance => : ", err);
  }
};

/**
 * Aller à la page souhaitée
 * @param {puppeteer.Page} page
 * @param {string} url url de la page souhaitée
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
 * Récupérer les urls des pages de résultats de la recherche
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
 * @param {string} urlFull url de la localité à sraper
 * @returns les urls de toutes les pages de la localité à scraper
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
 *  * Récupérer les pages à scraper
 * @param {puppeteer.browser} browser 
 * @returns {string[]} Les pages à scraper
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

/**
 * Échapper les tring pour les requêtes sql
 * @param {string} string donnée à échapper
 * @returns {string} donnée échappé
 */
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
 * @param {string} sql Requête sql
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
 * Formater le nom de la ville
 * @param {string} string Nom de la ville à formater
 * @returns {string} Nom de la ville formater
 */
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

/**
 * Vérifier si un bien à déja été scraper
 * @param {Object} property Un bien
 * @returns {boolean} 
 */
const checkIfPropertyIsALreadyScraped = async (property) => {
  try {
    const getPropertyUrlDbQuery = `SELECT source_url FROM property WHERE source_url = '${escapeMysqlRealString(property.detailUrl)}';`;


    const propertyUrlDb = await query(getPropertyUrlDbQuery);

    // const isAlreadyScraped = (0 === await query(getPropertyUrlDbQuery).length);

    const isAlreadyScraped = 0 === propertyUrlDb.length;

    return isAlreadyScraped;
  } catch (error) {
    saveErrorLog(error);
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

    const getCityDbQuery = `SELECT id, ${property.rentAverageColumnName} FROM city c WHERE LOWER(REPLACE(c.name, ' ', '-')) = LOWER('${escapeMysqlRealString(formatCityName(property.cityName))}') AND c.zipcode LIKE '${connection.escape(property.departmentCode)}%';`;


    const result = await query(getCityDbQuery);

    return result[0];
  } catch (error) {
    saveErrorLog(error);
  }
}
  
/**
 * Récupérer l'id du type de l'annonce à ajouter
 * @returns L'id du type
 */
const getPropertyTypeId = async (property) => {
  try {
    const getPropertyTypeIdQuery = `SELECT id FROM property_type pt WHERE LOWER(pt.type) = LOWER('${escapeMysqlRealString(property.type)}');`;

    const result = await query(getPropertyTypeIdQuery)
    return result[0].id;
  } catch (error) {
    saveErrorLog(error);
  }
}
  
/**
 * Calculer la rentabiité d'un bien
 * @param {Object} property bien à calculer la 
 * @returns la rentabilité
 */
const calculateRentability = async (property) => {
  try {
    let result = 0;
    let price;
    let rent;
    
    price = property.price + ( 9 * property.price / 100);
    rent = property.surface * property.rentAverageColumnName;
    result = (rent * 12 * 100) / price;
    
    return result.toFixed(1);
  } catch (error) {
    saveErrorLog(error);
  }
}

/**
 * Insertion du bien dans la bd
 * @param {Object} property une propriété à insérer dans la bdd
 * @returns la requête pour insérer le bien
 */
const insertProperty = async (property) => {
  try {
    let propertyTypeId;
    let rentability = '';
    let queryInsertData = '';
    
    await getCityDb(property).then(result => {
      if (!result) return;
      property.cityId = result.id;
      property.rentAverageColumnName = result[property.rentAverageColumnName];
    });
    
    if (property.cityId) {
      await getPropertyTypeId(property).then(result => propertyTypeId = result);
      
      await calculateRentability(property).then(result => rentability = result);
      
      const queryInsertProperty = `INSERT INTO property (source, city_id, property_type_id, surface, room_number, price, rentability, description, source_url) \nVALUES ('Scraping', ${connection.escape(property.cityId)}, ${connection.escape(propertyTypeId)}, ${connection.escape(property.surface)}, ${connection.escape(property.nbRoom)}, ${connection.escape(property.price)}, ${connection.escape(rentability)}, '${escapeMysqlRealString(property.description)}', '${escapeMysqlRealString(property.detailUrl)}');\n`;
  
    
      let queryInsertPropertyImages = 'INSERT INTO property_image (property_id, image, created_at, updated_at)\nVALUES ';
    
      for (let index = 0; index < property.images.length; index++) {
        const image = property.images[index];
        
        queryInsertPropertyImages += `(LAST_INSERT_ID(), '${escapeMysqlRealString(image)}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
    
        if ((property.images.length - 1) !== index) {
          queryInsertPropertyImages += ',\n'
        } else {
          queryInsertPropertyImages += ';\n'
        }
      }
  
      
      if (!queryInsertProperty || !queryInsertPropertyImages) return;
      
      queryInsertData = queryInsertData + queryInsertProperty + queryInsertPropertyImages;
      
      return queryInsertData;
    }
    
  } catch (error) {
    saveErrorLog(error.toString(), property.detailUrl);
  }
}

/**
 * Récupérer tous les biens des départements recherchés
 * @returns Tous les biens scrapés
 */
const getAllProperties = async () => {
  try {
    const browser = await getBrowser();

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
      
      const isAlreadyScraped = await checkIfPropertyIsALreadyScraped(property);
      
      if (isAlreadyScraped) {
        await goToPage(page, urlPropertyDetail);
  
        //Récupérer les informations accessibles uniquement sur la page du détail du bien
        const PropertyDetail = await page.evaluate(getMorePropertyInformations);
  
        property.description = PropertyDetail.description;
        property.images = PropertyDetail.images;
  
        connection.connect((error) => {
          try {
  
          insertProperty(property).then(result => {
            if (result) {
              queryInsertData += result;
            }
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
      }
    }

    // Fermer le navigateur
    await closeBrowser(browser);

    return queryInsertData;
  } catch (error) {
    saveErrorLog(error);
    console.error("/!\\ Error from getAllProperties() :", error);
  }
};

/**
 * Créer un nom de fichier horodater
 * @param {string} folder Dossier cible
 * @param {string} baseFileName Nom du fichier
 * @param {string} fileExtension extension du fichier
 * @param {boolean} isPartial défini si le format de l'horodatage, avec ou sans les secondes
 * @returns {string} Nom final du fichier
 */
const setFileName = (folder,baseFileName, fileExtension, isPartial = false) => {
  const currentDatetime = new Date();
  const year = currentDatetime.getFullYear().toString();
  const month = (currentDatetime.getMonth() + 1).toString();
  const date = currentDatetime.getDate().toString();
  const hours = currentDatetime.getHours().toString();
  const minutes = currentDatetime.getMinutes().toString();
  const seconds = currentDatetime.getSeconds().toString();

  const filenameParameter = { year, month, date, hours, minutes, seconds };
  let fileOutputName;

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

  if (isPartial === true) {
    fileOutputName = `${folder}${baseFileName}_${filenameParameter.year}${filenameParameter.month}${filenameParameter.date}.${fileExtension}`;
  } else {
    fileOutputName = `${folder}${baseFileName}_${filenameParameter.year}${filenameParameter.month}${filenameParameter.date}${filenameParameter.hours}${filenameParameter.minutes}${filenameParameter.seconds}.${fileExtension}`;
  }

  return fileOutputName;
}

/**
 * Créer un fichier sql pour l'insertion en bdd
 * @param {string} scrapedData Données scrapées
 * @returns {string} Nom du fichier créé
 */
const saveData = async (scrapedData) => {

  try {
    const sqlFileOutput = setFileName('./data_century21/','data_century21_scraped', 'sql');
  
    fs.writeFileSync(`${sqlFileOutput}`, scrapedData, 'utf8');
    console.log(`Les données ont été extraites et sauvegardées avec succès ! Visualisez-les dans '${sqlFileOutput}'`);
    
    return sqlFileOutput;
  } catch (error) {
    saveErrorLog(error.toString());
  }
};

/**
 * Ajouter le message d'erreur dans un fichier
 * @param {string} errorLog Message d'erreur
 * @param {string} moreInformations Informations complémentaire
 */
const saveErrorLog = (errorLog, moreInformations = '') => {
  const errorLogFileOutput = setFileName('./error_log_century21/','error_log_century21_scraping', 'txt', true);

  if (moreInformations) {
    moreInformations = moreInformations+ ' : ';
  }
  
  errorLog = '_ ' + moreInformations +  errorLog + '\n';

  fs.appendFile(`${errorLogFileOutput}`, errorLog, 'utf8', (error) => {
    if(error) {
    }

    console.log(errorLog);
    // process.exit();
  });
}


const scrapCentury = async () => {

  try {      
    console.time("Scraping ");
    const data = await getAllProperties();

    if ('' == data) {
      const message = 'Aucun nouveau bien n\'a été trouvé.';
      saveErrorLog(message);
    } else {
      const sqlFileOutput = await saveData(data);

      fs.readFile(`${sqlFileOutput}`, "utf8", async (error, data) => {    
        if (error) {
          console.error(error);
        }
  
        await query(data);
      });
    };

    console.timeEnd("Scraping ");
  } catch (error) {
    saveErrorLog(error);
    console.error("/!\\ Erreur : ", error);
  }

  // process.exit();
};

cron.schedule('* * * * *', async() => {
  console.log('Routine start ...');
  await scrapCentury();
  console.log('Routine end ...');
});