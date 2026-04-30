const fs = require('fs');
const codeScript = fs.readFileSync('script.js', 'utf8');
const codeGallery = fs.readFileSync('drinks/index.html', 'utf8');

// Quick and dirty eval
let DRINKS_DB;
let DRINKS;

eval(codeScript.split('const QUESTIONS')[0].replace('const DRINKS_DB =', 'DRINKS_DB ='));
eval(codeGallery.split('const DRINKS = ')[1].split('const SUB_FILTERS')[0].trim().replace(/;$/, '').replace(/^\[/, 'DRINKS = ['));

const merged = DRINKS_DB.map((sd, i) => {
    const gd = DRINKS.find(d => d.name === sd.name) || DRINKS[i];
    return {
        name: sd.name,
        price: sd.price,
        type: sd.type,
        image: sd.image, // from script.js, starts with "images/"
        desc: sd.desc,
        customs: sd.customs || [],
        tags: sd.tags,
        galleryTags: gd.tags,
        galleryVibe: gd.vibe,
        galleryTemp: gd.temp,
        active: true
    };
});

fs.writeFileSync('drinks.json', JSON.stringify(merged, null, 2));
console.log("Merged " + merged.length + " drinks into drinks.json");
