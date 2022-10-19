exports.addVIs = function(img){
  
  var evi = img.expression(
      '2.5 * (nir - red) / (nir + 6 * red - 7.5 * blue + 1)',
      {red: img.select('RED'),
      nir: img.select('NIR'),
      blue: img.select('BLUE')
      }).select([0], ['evi']);
	  
  var savi = img.expression(
      '((nir - red) / (nir + red + 0.5 )) * (1.5)',
      {red: img.select('RED'),
      nir: img.select('NIR')
      }).select([0], ['savi']);
      
  var gcvi = img.expression(
    '(nir / green) - 1',
    {nir: img.select('NIR'),
    green: img.select('GREEN')
    }).select([0], ['gcvi']);
    
  var tvi = img.expression(
    '0.5 * (120 * (nir - green) - 200 * (red - green))',
    {nir: img.select('NIR'),
    green: img.select('GREEN'),
    red: img.select('RED')
    }).select([0], ['tvi']);
    
  var sndvi = img.expression(
    '(nir - red) / (red + nir + 0.16)',
    {nir: img.select('NIR'),
    red: img.select('RED')
    }).select([0], ['sndvi']);
    
  var ndvi = img.expression(
    '(nir - red) / (red + nir)',
    {nir: img.select('NIR'),
    red: img.select('RED')
    }).select([0], ['ndvi']);
	
  var m_ndvi = img.expression(
    '(nir-(red+0.05))/(nir+(red+0.05))', {
      'nir': img.select('NIR'),
      'red': img.select('RED')
    }).select([0], ['m_ndvi']);
	
  var gndvi = img.expression(
    '(nir - green) / (green + nir)',
    {nir: img.select('NIR'),
    green: img.select('GREEN')
    }).select([0], ['gndvi']);
	
  var wdrvi = img.expression(
    '(0.2 * nir - red) / (red + 0.2 * nir)',
    {nir: img.select('NIR'),
    red: img.select('RED')
    }).select([0], ['wdrvi']);
	
 /* nbr1* may be considered as NDMI or lswi*/
  var nbr1 = img.expression(
    '(nir - swir1) / (nir + swir1)',
    {nir: img.select('NIR'),
     swir1: img.select('SWIR1')
    }).select([0], ['nbr1']);
  
  var nbr2 = img.expression(
    '(nir - swir2) / (nir + swir2)',
    {nir: img.select('NIR'),
     swir2: img.select('SWIR2')
    }).select([0], ['nbr2']);
  
  /* Simple tillage index */
  var sti = img.expression(
    'swir1/swir2',
    {swir1: img.select('SWIR1'),
     swir2: img.select('SWIR2')
    }).select([0], ['sti']);
  
  /* NDTI */
  var ndti = img.expression(
    '(swir1 - swir2) / (swir1 + swir2)',
    {swir1: img.select('SWIR1'),
     swir2: img.select('SWIR2')
    }).select([0], ['ndti']);
  
  /* Modified CRC* may be considered as NDSI*/
  var crc = img.expression(
    '(swir1 - green) / (swir1 + green)',
    {green: img.select('GREEN'),
     swir1: img.select('SWIR1')
    }).select([0], ['crc']);
  
  return ee.Image.cat([img, evi, savi, gcvi, tvi, sndvi, ndvi, m_ndvi, gndvi, wdrvi, nbr1, nbr2, sti, ndti, crc]);
};
//tasseled cap 
exports.add_TC = function(image) {
    
    var img = image.select(['BLUE', 'GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2']);
    
    // coefficients for Landsat surface reflectance (Crist 1985)
    var brightness_c= ee.Image([0.3037,0.2793,0.4743,0.5585,0.5082,0.186312]);
	var greenness_c= ee.Image([-0.2848,-0.2435,-0.5436,0.7243,0.0840,-0.1800]);
    var wetness_c= ee.Image([0.1509,  0.1973,  0.3279,  0.3406, -0.7112, -0.4572]);

    var brightness = img.multiply(brightness_c);
    var greenness = img.multiply(greenness_c);
    var wetness = img.multiply(wetness_c);
    
    brightness = brightness.reduce(ee.call("Reducer.sum"));
    greenness = greenness.reduce(ee.call("Reducer.sum"));
    wetness = wetness.reduce(ee.call("Reducer.sum"));
    
    var tasseled_cap = ee.Image(brightness)
                      .addBands(greenness)
                      .addBands(wetness)
                      .rename(['brightness','greenness','wetness']);
    
    return image.addBands(tasseled_cap);
  };
  

  