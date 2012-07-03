
module.exports = function(flowData){

  var packages = {};
  var queue = flowData.files.queue;
  
  for (var i = 0, file; file = queue[i]; i++)
    if (file.type == 'script' && file.package)
    {
      var package = packages[file.package];
      if (!package)
        package = packages[file.package] = [];

      package.push.apply(package, buildDep(file, file.package));
    }

  flowData.js.packages = packages;

  // create package files
  var basisFileContent = flowData.files.get(flowData.js.basisScript).content.replace(/this\.__resources__ \|\| \{\}/, JSON.stringify(flowData.js.resourceMap));
  for (var name in packages)
  {
    console.log('Package ' + name + ':\n  ' + packages[name].map(function(f){ return f.relpath }).join('\n  '));

    flowData.files.add({
      outputFilename: name + '.js',
      outputContent: wrapPackage(packages[name], flowData, flowData.options.jsSingleFile || packageName == 'basis' ? basisFileContent : '')
    });
  }
}
module.exports.handlerName = 'Make javascript packages';

//
// make require file list
//

function buildDep(file, package){
  var files = [];

  if (file.processed || file.package != package)
    return files;

  file.processed = true;

  for (var i = 0, depFile; depFile = file.deps[i++];)
    files.push.apply(files, buildDep(depFile, file.package));

  files.push(file);

  return files;
}

//
// wrap package
//

function extractBuildContent(file){
  return '// ' + file.filename + '\n' +
    '[' +
      '"' + file.namespace + '", function(basis, global, __dirname, exports, resource, module, __filename){' +
        file.content +
      '}' + 
    ']';
}

function extractSourceContent(file){
  return '//\n// ' + file.relpath + '\n//\n' +
    '{\n' +
    '  ns: "' + file.namespace + '",\n' + 
    '  path: "' + file.relpath + '/",\n' + 
    '  fn: "' + file.baseURI + '",\n' +
    '  body: function(){\n' +
         file.content + '\n' +
    '  }\n' + 
    '}';
}

var packageWrapper = [
  "(function(){\n" +
  "'use strict';\n\n",

  "\n}).call(this);"
];

function wrapPackage(package, flowData, contentPrepend){
  return !flowData.options.buildMode
    // source mode
    ? [
        '// filelist: \n//   ' + package.map(function(file){
          return file.relpath;
        }).join('\n//   ') + '\n',

        packageWrapper[0],
        contentPrepend,

        '[\n',
          package.map(extractSourceContent).join(',\n'),
        '].forEach(' + function(module){
           var path = module.path;    
           var fn = path + module.fn;
           var ns = basis.namespace(module.ns);
           ns.source_ = Function.body(module.body);
           ns.filename_ = module.path + module.fn;
           new Function('module, exports, global, __filename, __dirname, basis, resource',
             '/** @namespace ' + ns.path + ' */\n' + ns.source_ + '//@ sourceURL=' + fn
           ).call(ns, ns, ns.exports, this, fn, path, basis, function(url){ return basis.resource(path + url) });
           Object.complete(ns, ns.exports);
         } + ', this)',

        packageWrapper[1]
      ].join('')
    // pack mode
    : [
        '// filelist: \n//   ' + package.map(function(file){
          return file.relpath;
        }).join('\n//   ') + '\n',

        packageWrapper[0],
        contentPrepend,

        '[\n',
          package.map(extractBuildContent).join(',\n'),
        '].forEach(' + function(module){
           var fn = module[1];
           var ns = basis.namespace(module[0]);
           fn.call(ns, basis, this, "", ns.exports, basis.resource, ns, '');
           Object.complete(ns, ns.exports);
         } + ', this)',

        packageWrapper[1]
      ].join('');
}