
var path = require('path');

module.exports = function(flowData){
  var buildDir = flowData.buildDir;
  var outputFiles = flowData.files.queue.filter(function(file){
    if (file.type == 'style' && file.htmlInsertPoint)
      return file;
  });

  // save output files
  flowData.css.outputFiles = outputFiles;


  //
  // build generic style file
  //

  var genericStyle = flowData.files.queue.filter(function(file){
    if (file.type == 'style' && file.generic)
      return file;
  });

  var genericFile = flowData.css.genericFile;
  if (genericStyle.length)
  {
    genericFile.content = genericStyle.map(function(file){
      return '@import url(' + file.filename + ');'
    }).join('\n');
    console.log(genericFile.content);
  }


  //
  // prepare output files
  //

  // make target filename for output
  for (var i = 0, file, targetMap = {}; file = outputFiles[i]; i++)
  {
    var baseOutputFilename = file.outputFilename || (file.filename ? path.basename(file.filename, '.css') : '') || 'style';
    var idx = 0;
    var outputFilename = baseOutputFilename;

    while (targetMap[outputFilename])
      outputFilename = baseOutputFilename + (++idx);

    file.outputFilename = path.resolve(buildDir + '/' + outputFilename + '.css');
    targetMap[outputFilename] = true;
  }
}