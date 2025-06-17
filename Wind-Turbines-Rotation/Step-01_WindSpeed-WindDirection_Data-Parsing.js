// Define area of interest
var aoi = 
    /* color: #0b4a8b */
    /* shown: false */
    /* displayProperties: [
      {
        "type": "rectangle"
      }
    ] */
    ee.FeatureCollection(
        [ee.Feature(
            ee.Geometry.Polygon(
                [[[-11.11936435768948, 61.041472818639726],
                  [-11.11936435768948, 49.70202021677499],
                  [2.3279012673105193, 49.70202021677499],
                  [2.3279012673105193, 61.041472818639726]]], null, false),
            {
              "system:index": "0"
            })]);

// Define period of interest
var startDate = ee.Date('2024-06-01');
var endDate = ee.Date('2024-09-01');

// Load daily aggregated ERA5-Land wind data
var dataset = ee.ImageCollection("ECMWF/ERA5_LAND/DAILY_AGGR")
  .select(['u_component_of_wind_10m', 'v_component_of_wind_10m'])
  .filterBounds(aoi);

// Define function to compute wind speed and wind direction
function computeSpeedAndDirection(image) {
  var u = image.select('u_component_of_wind_10m');
  var v = image.select('v_component_of_wind_10m');
  var speed = u.hypot(v).rename('wind_speed'); // wind speed
  var direction = u.atan2(v) // wind direction
    .multiply(180 / Math.PI)
    .add(180)
    .rename('wind_direction');
  return image.addBands([speed, direction]).clip(aoi);
}

// Apply function to entire collection
var windCollection = dataset.map(computeSpeedAndDirection);
var dailyWind = windCollection.filterDate(startDate, endDate);

// Compute wind speed
var medianWindSpeed = dailyWind.select('wind_speed').median().rename('median_wind_speed');

// Compute wind direction to 8 compass sectors
function assignCompassSector(image) {
  var dir = image.select('wind_direction');
  var sector = dir.add(22.5)  // center compass bins
    .mod(360)
    .divide(45)
    .floor()
    .toInt()
    .rename('wind_compass_sector');
  return image.addBands(sector);
}
var dailySectors = dailyWind.map(assignCompassSector);

// Compute most common sector
var dominantSector = dailySectors
  .select('wind_compass_sector')
  .reduce(ee.Reducer.mode())
  .rename('dominant_wind_sector');

// Combine results into a single image
var windSummary = medianWindSpeed
  .addBands(dominantSector)
  .clip(aoi);

// Visualisation styles
var speedVis = {
  min: 0,
  max: 10,
  palette: ['#313695', '#74add1', '#ffffbf', '#f46d43', '#a50026']
};

var sectorVis = {
  min: 0,
  max: 7,
  palette: [
    '#e31a1c', // N 
    '#ff7f00', // NE 
    '#6a3d9a', // E 
    '#a6cee3', // SE 
    '#1f78b4', // S 
    '#33a02c', // SW 
    '#b2df8a', // W 
    '#fb9a99'  // NW 
  ]
};

// Visualise rasters
Map.centerObject(aoi);
Map.addLayer(windSummary.select('median_wind_speed'), speedVis, 'Median Wind Speed');
Map.addLayer(windSummary.select('dominant_wind_sector'), sectorVis, 'Dominant Wind Sector');

// Export wind speed raster
Export.image.toDrive({
  image: windSummary.select('median_wind_speed'),
  description: 'Wind_Speed',
  folder: 'Wind',
  fileNamePrefix: 'Wind_Speed',
  region: aoi.geometry(),
  scale: 10000,  // ERA5 resolutoin is approx 6km x 9km
  crs: 'EPSG:4326',
  maxPixels: 1e13
});

// Export wind direction sector raster
Export.image.toDrive({
  image: windSummary.select('dominant_wind_sector'),
  description: 'Wind_Sector',
  folder: 'Wind',
  fileNamePrefix: 'Wind_Sector',
  region: aoi.geometry(),
  scale: 10000, // ERA5 resolutoin is approx 6km x 9km
  crs: 'EPSG:4326',
  maxPixels: 1e13
});