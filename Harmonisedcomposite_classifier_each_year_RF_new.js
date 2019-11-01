/**
**date:30/10/2019
**version:1
*this code harmonise landsats5,7,8 and classify the annual composites according to the polygons taken from the orthophotos

*it was inspired by several resources:
**harmonisation taken from here https://developers.google.com/earth-engine/tutorials/community/landsat-etm-to-oli-harmonization
**classificication inspired by here https://www.linkedin.com/pulse/time-series-landsat-data-google-earth-engine-andrew-cutts/
**functions were also taken from Zander Venters code

*todo:
**find the coverage of the produced annual median composite- calculate the ratio towards the most complet one in the colleciton
**increase the accuracy of classification over landsat5,7-try more polygons samples
**mask the grassland and make a climate model from current period - check similarities with Sentinel-2
** make a export loop (client side)

 */
//
// ################################################################
// ### FUNCTIONS ###
// ################################################################

// Define coefficients supplied by Roy et al. (2016) for translating ETM+
// surface reflectance to OLI surface reflectance.
var coefficients = {
  itcps: ee.Image.constant([0.0003, 0.0088, 0.0061, 0.0412, 0.0254, 0.0172]).multiply(10000),
  slopes: ee.Image.constant([0.8474, 0.8483, 0.9047, 0.8462, 0.8937, 0.9071])
};

// Define function to get and rename bands of interest from OLI.
function renameOLI(img) {
  return img.select(
		['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'pixel_qa'],
		['Blue', 'Green', 'Red', 'NIR', 'SWIR1', 'SWIR2', 'pixel_qa']
	);
}

// Define function to get and rename bands of interest from ETM+.
function renameETM(img) {
  return img.select(
		['B1', 'B2', 'B3', 'B4', 'B5', 'B7', 'pixel_qa'],
		['Blue', 'Green', 'Red', 'NIR', 'SWIR1', 'SWIR2', 'pixel_qa']
  );
}

// Define function to apply harmonization transformation.
function etm2oli(img) {
  return img.select(['Blue', 'Green', 'Red', 'NIR', 'SWIR1', 'SWIR2'])
    .multiply(coefficients.slopes)
    .add(coefficients.itcps)
    .round()
    .toShort()
    .addBands(img.select('pixel_qa')
  );
}

// Define function to mask out clouds and cloud shadows.
function fmask(img) {
  var cloudShadowBitMask = 1 << 3;
  var cloudsBitMask = 1 << 5;
  var qa = img.select('pixel_qa');
  var mask = qa.bitwiseAnd(cloudShadowBitMask).eq(0)
    .and(qa.bitwiseAnd(cloudsBitMask).eq(0));
  return img.updateMask(mask);
}

// Define function to calculate NBR.
function calcNBR(img) {
  return img.normalizedDifference(['NIR', 'SWIR2']).rename('NBR');
}

function addVariables(img) {
  //msavi2
  var msavi2 = img.expression(
  '(2 * nir + 1 - sqrt(pow((2 * nir + 1), 2) - 8 * (nir - red)) ) / 2', 
  {
    'nir': img.select('NIR'), 
    'red': img.select('Red')
  }
);
  // Return the image with the added bands.
  return img
    // Add an NDVI band.
    .addBands(img.normalizedDifference(['NIR', 'Red']).rename('ndvi')).float()
	// Add msavi2
	.addBands(msavi2.rename('msavi2')).float();
};

// Define function to prepare OLI images.
function prepOLI(img) {
  var orig = img;
  img = renameOLI(img);
  img = fmask(img);
  img = addVariables(img);
  return ee.Image(img.copyProperties(orig, orig.propertyNames()));
}

// Define function to prepare ETM+ images.
function prepETM(img) {
  var orig = img;
  img = renameETM(img);
  img = fmask(img);
  img = etm2oli(img);
  img = addVariables(img);
  return ee.Image(img.copyProperties(orig, orig.propertyNames()));
}
//Function to find unique values of a field in a collection
function uniqueValues(collection,field){
    var values  =ee.Dictionary(collection.reduceColumns(ee.Reducer.frequencyHistogram(),[field]).get('histogram')).keys();
    
    return values;
  }

//Function to simplify data into daily mosaics
function dailyMosaics(imgs){
  //Simplify date to exclude time of day
  imgs = imgs.map(function(img){
  var d = ee.Date(img.get('system:time_start'));
  var day = d.get('day');
  var m = d.get('month');
  var y = d.get('year');
  var simpleDate = ee.Date.fromYMD(y,m,day);
  return img.set('simpleTime',simpleDate.millis());
  });
  
  //Find the unique days
  var days = uniqueValues(imgs,'simpleTime');
  
  imgs = days.map(function(d){
    d = ee.Number.parse(d);
    d = ee.Date(d);
    var t = imgs.filterDate(d,d.advance(1,'day'));
    var f = ee.Image(t.first());
    t = t.mosaic();
    t = t.set('system:time_start',d.millis());
    t = t.copyProperties(f);
    return t;
    });
    imgs = ee.ImageCollection.fromImages(imgs);
    
    return imgs;
}

//function to count the non zero pixels in the region
function countPixels(img) {
   var counts= img.reduceRegion({
		reducer: ee.Reducer.count(),
		geometry: aoi,
		scale:30,
		maxPixels: 1e9
	});
	return img;
}



// ################################################################
// ### APPLICATION ###
// ################################################################

// Define the area 
var geometry = ee.FeatureCollection("users/ruegdeg/CH_study_Urseren/polygons_to_classify2017");
var valdata = ee.FeatureCollection("users/ruegdeg/CH_study_Urseren/polygons_to_validate2017");
var aoi = ee.FeatureCollection("users/ruegdeg/CH_study_Urseren/study_area_CH_WGS");

// Display AOI on the map.
Map.centerObject(aoi, 10);
Map.addLayer(aoi, {color: 'f8766d'}, 'AOI');
Map.setOptions('HYBRID');

// Get terrain data
var elevation = ee.Image('USGS/SRTMGL1_003');
var terrain = ee.Algorithms.Terrain(elevation);

// Get Landsat surface reflectance collections for OLI, ETM+ and TM sensors.
var oliCol = ee.ImageCollection('LANDSAT/LC08/C01/T1_SR');
var etmCol= ee.ImageCollection('LANDSAT/LE07/C01/T1_SR');
var tmCol= ee.ImageCollection('LANDSAT/LT05/C01/T1_SR');

// Define a collection filter.
var colFilter = ee.Filter.and(
  ee.Filter.bounds(aoi),
  ee.Filter.calendarRange(121, 304, 'day_of_year'),
  ee.Filter.lt('CLOUD_COVER', 90),
  ee.Filter.lt('GEOMETRIC_RMSE_MODEL', 10),
  ee.Filter.or(
    ee.Filter.eq('IMAGE_QUALITY', 9),
    ee.Filter.eq('IMAGE_QUALITY_OLI', 9)
  )
);

// Filter collections and prepare them for merging.
oliCol = oliCol.filter(colFilter).map(prepOLI);
etmCol= etmCol.filter(colFilter).map(prepETM);
tmCol= tmCol.filter(colFilter).map(prepETM);

// Merge the collections.
var col = oliCol
  .merge(etmCol)
  .merge(tmCol);
/*
var dailyCol= dailyMosaics(col)
print(dailyCol)
*/
// Calculate median NDVI for pixels intersecting the AOI for
// each image in the collection. Add the value as an image property.
var allObs = col.map(function(img) {
  var obs = img.reduceRegion({
    geometry: aoi,
    reducer: ee.Reducer.median(),
    scale: 30
  });
  return img.set('ndvi', obs.get('ndvi'));
});

// Make a chart of all observations where color distinguishes sensor.
var chartAllObs = ui.Chart.feature.groups(
  allObs, 'system:time_start', 'ndvi', 'SATELLITE'
)
.setChartType('ScatterChart')
.setSeriesNames(['TM', 'ETM+', 'OLI'])
.setOptions({
  title: 'All Observations (less NDVI likely relates to less green pixels considered)',
  colors: ['f8766d', '00ba38', '619cff'],
  hAxis: {title: 'Date'},
  vAxis: {title: 'ndvi'},
  pointSize: 6,
  dataOpacity: 0.5
});
print(chartAllObs);

// Reduce the ImageCollection to intra-annual median.

// create a list of years to be iterated over next..useful as we keep the sequence
var years = ee.List.sequence(1985, 2019) 
// create a collection with 1 image for each year
var collectYear = ee.ImageCollection(years.map(function(y) {
    var start = ee.Date.fromYMD(y, 5, 1)
    var end = start.advance(10, 'month')
	var reducers = ee.Reducer.median().combine(ee.Reducer.stdDev(),"",true)
    return col.filterDate(start, end).reduce(reducers).set('year', y);
}))
print (collectYear)

// count number of bands in each image, if 0 remove from image collection
var nullimages = collectYear
    .map(function(image) {
      return image.set('count', image.bandNames().length())
    })
    .filter(ee.Filter.gt('count', 3))
print(nullimages)


// ################################################################
// ### RF ###
// ################################################################
var listOfImages = nullimages.toList(nullimages.size());
print(listOfImages)
var img_RF = listOfImages.get(29);//take the 2017 image
var imageForRF = ee.Image(img_RF)

// Use these bands for prediction.
var bands = ['Blue_median', 'Green_median', 'Red_median', 'NIR_median', 'SWIR1_median', 'SWIR2_median', 'ndvi_median','msavi2_median','ndvi_stdDev','msavi2_stdDev'];
// Overlay the points on the imagery to get RF training
var training = imageForRF.sampleRegions({
  collection: geometry,
  properties: ['LC17_clas2'],
  scale: 30
});

// Make a Random Forest classifier and train it.
var RFclassifier = ee.Classifier.randomForest(10) /// bad defaults, the random forest needs to be at least 10 
    .train(training, 'LC17_clas2', bands);

//classify the imagery used for developing the model
var InImageClassified = imageForRF.select(bands).classify(RFclassifier);
print(InImageClassified)

//lenght of the annual composite collection
var numTrees = ee.List.sequence(0,31, 1);
print(numTrees)

//iterate over composite collection to create the annual RF classication maps
var forests  = numTrees.map(function(t) {
	  var image = ee.Image(listOfImages.get(t))	
      return image.select(bands).classify(RFclassifier);
});
print(forests)

// Define a palette for the legend.
var igbpPalette = [
  'FF0000','cc4df2','e6e64d','e6a124','24f24d','4abd70','007500','004af4','242e37','ff41dc','c9c9c9','7c530c'
];

Map.addLayer(InImageClassified, {min: 1, max: 42, palette: igbpPalette}, 'classified');
Map.addLayer(ee.Image(forests.get(10)), {min: 1, max: 42, palette: igbpPalette}, 'classified10');

//define accuracy on training polygons
var trainAccuracy = RFclassifier.confusionMatrix();

//define the validation (independent) polygons
var validation = InImageClassified.sampleRegions({
  collection: valdata,
  properties: ['LC17_class'],
  scale: 30,
});

//test the accuracy using validation polygons
var testAccuracy = validation.errorMatrix('LC17_class', 'classification');
//export the accuracy measures
var exportAccuracy = ee.Feature(null, {matrix: testAccuracy.array()})
//Print the error matrix to the console
print('Validation error matrix: ', testAccuracy);
//Print the overall accuracy to the console
print('Training overall accuracy: ', trainAccuracy.accuracy());///resubstitution accuracy
print('Validation overall accuracy: ', testAccuracy.accuracy());


//make a list out of the images-select some image from the collection
var image1 = ee.Image(listOfImages.get(0));
var image2 = ee.Image(listOfImages.get(10));
var image3 = ee.Image(listOfImages.get(31));

var visParams = {
  bands: ['Red_median', 'Green_median', 'Blue_median'],
  min: 0,
  max: 3000,
  gamma: 1.4,
};

Map.addLayer(image1, visParams, 'image1');
Map.addLayer(image2, visParams, 'image2');
Map.addLayer(image3, visParams, 'image3');

Map.addLayer(image1.select('ndvi_median').addBands(image2.select('ndvi_median')).addBands(image3.select('ndvi_median')));


// Export some imagery image, specifying scale and region.
Export.image.toDrive({
  image: InImageClassified,
  description: 'LandsatClassified',
  scale: 30,
  region: aoi,
  maxPixels: 1e13,

});

var image10 = ee.Image(forests.get(10))
Export.image.toDrive({
  image: image10,
  description: 'LandsatClassified_10',
  scale: 30,
  region: aoi,
  maxPixels: 1e13,

});

// Export the accuracy matrix.
Export.table.toDrive({
  collection: ee.FeatureCollection(exportAccuracy),
  description: 'LandsatExportAccuracy',
  fileFormat: 'CSV'
});
//



