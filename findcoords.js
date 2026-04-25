const { PDFParse } = require('pdf-parse');
const fs = require('fs');
const parser = new PDFParse();
parser.pdf(fs.readFileSync('public/template.pdf'), {
  pagerender: function(pageData) {
    return pageData.getTextContent().then(function(textContent) {
      textContent.items.forEach(item => {
        if (item.str.includes('{{') || item.str.includes('machine') || item.str.includes('week')) {
          console.log(JSON.stringify({str: item.str, x: Math.round(item.transform[4]), y: Math.round(item.transform[5])}));
        }
      });
      return '';
    });
  }
}).then(() => console.log('done')).catch(e => console.error(e.message));
