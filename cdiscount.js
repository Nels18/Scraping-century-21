// Importer Puppeteer 
const puppeteer = require('puppeteer');


(async () => {
    // Lancer un navigateur et ouvrir une page
    try {
        const url = 'https://www.century21.fr/annonces/f/achat/d-94_val_de_marne/';
        const browser = await puppeteer.launch({ headless: false });
        const page = await browser.newPage();
        let allUrls = [];
        let nbLastPage;
    
    
        // for (let i = 0; i < array.length; i++) {
        //     const element = array[i];
            
        // }

        // Aller à la page souhaitée
        await page.goto(url, { waitUntil: 'networkidle2' });
    
        // await page.click('#footer_tc_privacy_container_button button[title=Accepter]');
        await page.click('div[data-actions^="deny-all"]');
    
        /**
         * Récupérer les urls de toutes les pages de la recherche dans la pagination
         */
        const getNbLastPage = await page.evaluate(() => {
            // Pagination
            const urls = document.querySelectorAll('.c-the-pagination-bar ul.tw-flex.tw-justify-center')[0].children;
            nbLastPage = urls[urls.length - 1].innerText;
        })

        getNbLastPage;

        const getUrlsPages = await page.evaluate(() => {

            let pagesUrls = [];
            for (let i = 1; i <= nbLastPage; i++) {
                if (i > 1) {
                    pagesUrls.push(`https://www.century21.fr/annonces/f/achat/d-94_val_de_marne/page-${i}`);
                } else {
                    pagesUrls.push('https://www.century21.fr/annonces/f/achat/d-94_val_de_marne/');
                }
                console.log('pagesUrls :', pagesUrls);
            }

            return pagesUrls;
        })
    
        allUrls = [...getUrlsPages];
        console.log('allUrls :', allUrls);
        
        await page.evaluate(() => {
            let properties = [];
            
            const propertiesScrapped = document.querySelectorAll('.c-the-property-thumbnail-with-content__col-right');
    
            propertiesScrapped.forEach(propertyScrapped => {
                let infos = [];
                let info;
    
                propertyScrapped.querySelectorAll('.c-text-theme-heading-4').forEach(element => {
                    for(var value of element.childNodes.values()) {
    
                        // Get data
                        if (value.nodeName == "#text") {
                            info = value
                            info = info.textContent;
                            info = info.replaceAll('\n','');
                            info = info.trim();
                            info = info.replaceAll(/\s+/g,' ');
                            infos.push(info);
                        }
                    }
    
                    // Delete unless data
                    infos.pop();
    
                    // Format data
                    infos[0] = infos[0].replaceAll( /\s[0-9]+$/g,'');
                    infos[1] = infos[1].replaceAll( ' m','');
                    infos[2] = infos[2].replaceAll( /^,\s/g,'');
                    infos[2] = infos[2].replaceAll( /(pièce|s)/g,'');
    
                    properties.push({
                        cityName : infos[0],
                        surface : infos[1],
                        nbRoom : infos[2],
                        price : propertyScrapped.querySelector('.c-text-theme-heading-1').innerText,
                        description : propertyScrapped.querySelector('.c-text-theme-base').innerText
                    });
                });
            });
            console.log('properties :', properties);
            return properties;
        });
    
        await page.evaluate(() => {
            const currentPageLink = document.querySelectorAll('.is-active[aria-label="pagination"]');

            if (nbLastPage != currentPageLink[0].innerText) {
                
            }
        
            console.log('currentPageLink :', currentPageLink[0].innerText);
        })
    } catch (error) {
        console.error(error)
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