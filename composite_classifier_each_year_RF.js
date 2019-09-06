//making the orenburg analysis
//code inspired by https://www.linkedin.com/pulse/time-series-landsat-data-google-earth-engine-andrew-cutts/
var geometry = ee.FeatureCollection('ft:1RJOjyroIcfdwJWu6Vnuqzt9vaSrsbLbinPaH56Yz');
var filter = ee.Filter.calendarRange(5,9, 'month');


// Landat 5 surface reflection data
var L5coll = ee.ImageCollection('LANDSAT/LT05/C01/T1_SR')
.filter(ee.Filter.lt('CLOUD_COVER',25))
.filterDate('2017-05-01', '2017-10-01')
.select(['B4','B3', 'B2', 'B1'])
.filterBounds(AOI)

//var L5collFilter = L5coll.filter(filter);
//print(L5collFilter)

	
// Landat 7 surface reflection data, fill in the gaps! See USGS pages for more info
var L7coll = ee.ImageCollection('LANDSAT/LE07/C01/T1_SR')
.filter(ee.Filter.lt('CLOUD_COVER',25))
.select(['B7','B5','B4','B3', 'B2', 'B1'])
.filterBounds(AOI)
.map(function(image){
	var filled1a = image.focal_mean(2, 'square', 'pixels', 1)
	return filled1a.blend(image);
})
//var L7collFilter = L7coll.filter(filter);
//print(L7collFilter)


// Landat 8 surface reflection data, rename the band names. See USGS pages for more info
var L8coll = ee.ImageCollection('LANDSAT/LC08/C01/T1_SR')
.filter(ee.Filter.lt('CLOUD_COVER',5))
.filterBounds(AOI)
.map(function(image){
  //return image.rename(['B0', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B11']);
  return image.rename(['B0', 'B1', 'B2', 'B3', 'B4', 'B5', 'B7', 'B8', 'B9', 'B10', 'B11', 'B12']);
})
.select(['B7','B5','B4','B3', 'B2', 'B1'])
///check the bands setting here usgs.gov/faqs/what-are-band-designations-landsat-satellites?qt-news_science_products=0#qt-news_science_products
//var L8collFilter = L8coll.filter(filter);
print(L8coll)
	
	
// merge L5, L7 & L8
//var collection_merge = ee.ImageCollection(L5collFilter.merge(L7collFilter.merge(L8collFilter)));
var collection_merge = ee.ImageCollection(L5coll.merge(L7coll.merge(L8coll)));

//print (collection_merge)

// create a list of years to be iterated over next..
var years = ee.List.sequence(1984, 2019)
//print (years)

// create a collection with 1 image for each year
var collectYear = ee.ImageCollection(years
  .map(function(y) {
    var start = ee.Date.fromYMD(y, 6, 1)
    var end = start.advance(9, 'month');
    //return collection_merge.filterDate(start, end).reduce(ee.Reducer.median())
	//return collection_merge.qualityMosaic('system:time_start');
    return collection_merge.mosaic();
}))
print (collectYear)

// count number of bands in each image, if 0 remove from image collection
var nullimages = collectYear
    .map(function(image) {
      return image.set('count', image.bandNames().length())
    })
    .filter(ee.Filter.gt('count', 3))
print(nullimages)

//make a list out of the images-select some image from the collection
var listOfImages = nullimages.toList(nullimages.size());
var img1 = listOfImages.get(0);
var image1 = ee.Image(img1)
print(image1)
var img2 = listOfImages.get(10);
var image2 = ee.Image(img2)
print(image2)


// Define the visualization parameters.
var vizParams = {
  bands: ['B5', 'B4', 'B3'],
  min: 0,
  max: 0.5,
  gamma: [0.95, 1.1, 1]
};

// Center the map and display the image.
//Map.setCenter(-122.1899, 37.5010, 10); // San Francisco Bay
Map.addLayer(image1, vizParams, 'false color composite');
//Map.addLayer(image1, {bands: ['B4', 'B3', 'B2'], max: 0.4}, 'image');
//ready to use-----
//Map.addLayer(image1, {bands: ['B3', 'B2', 'B1']}, 'image1');
//Map.addLayer(image2, {bands: ['B3', 'B2', 'B1']}, 'image2');
Map.centerObject(AOI)
Map.addLayer(AOI) 

//////RFclassification////////
//here we would consider a year of change 
//make a list out of the images-select some image from the collection
var img_RF = listOfImages.get(35-2);
var imageForRF = ee.Image(img_RF)


 
// Use these bands for prediction.
var bands = ['B7','B5','B4','B3', 'B2', 'B1'];
// Overlay the points on the imagery to get training.
var trainingFromImage = imageForRF.sampleRegions({
  collection: trainPoints,
  properties: ['class'],
  scale: 30
});
/* var training = collectYear.sampleRegions({
  collection: trainPoints,
  properties: ['class'],
  scale: 30
}); */

// Make a Random Forest classifier and train it.
var RFclassifier = ee.Classifier.randomForest(10)
    .train(trainingFromImage, 'Land_Cover_Type_1');

var InImageClassified = imageForRF.classify(RFclassifier);
print(InImageClassified)


	
	
// Train a CART classifier with default parameters.
var trained = ee.Classifier.cart().train(trainingImage, 'class', bands);

// Classify the image with the same bands used for training.
var classified = imageForRF.classify(trained);
print(classified)










