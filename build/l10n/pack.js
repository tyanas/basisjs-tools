
var at = require('../js/ast_tools');

module.exports = function(flowData){
  function packKey(key){
    return l10nIndex.keys.hasOwnProperty(key)
      ? '#' + l10nIndex.keys[key].toString(36)
      : '';
  }

  function packBind(name){
    if (name.substr(0, 5) == 'l10n:')
    {
      var packed = packKey(name.substr(5));

      if (packed)
      {
        packed = 'l10n:' + packed;

        fconsole.log(name + ' -> ' + packed);

        return packed;
      }
      else
        fconsole.log('[!] l10n key ' + packed + ' not found (ignored)');
    }

    return name;
  }

  var fconsole = flowData.console;

  if (flowData.options.l10nPack)
  {
    var l10nIndex = flowData.l10n.index;

    if (!l10nIndex)
      throw 'l10n index must be built before compression';

    //
    // pack definitions
    //
    fconsole.log('Pack createDictionary');
    fconsole.incDeep();
    flowData.l10n.defList.forEach(function(entry){
      fconsole.log(entry.name);

      var dict = {};
      dict[entry.name] = entry.keys;

      entry.args[2] = ['array', packDictionary(dict, l10nIndex.map).map(function(token){
        return [typeof token == 'number' ? 'num' : 'string', token];
      })];
    });
    fconsole.decDeep();
    fconsole.log();


    //
    // pack getToken
    //
    fconsole.log('Pack getToken');
    fconsole.incDeep();
    flowData.l10n.getTokenList.forEach(function(entry){
      var key = entry.args[0][1];
      var packed = packKey(key);

      if (packed)
      {
        fconsole.log(key + ' -> ' + packed);
        entry.args[0][1] = packed;
      }
      else
        fconsole.log('[!] l10n key ' + key + ' not found (ignored)');

    });
    fconsole.decDeep();
    fconsole.log();


    //
    // pack packages
    //
    fconsole.log('Pack packages');
    fconsole.incDeep();
    flowData.l10n.packages.forEach(function(file){
      fconsole.log(file.jsRef);
      file.jsResourceContent = packDictionary(file.jsResourceContent, l10nIndex.map);
    });
    fconsole.decDeep();
    fconsole.log();


    //
    // process templates
    //
    var tmplAt = require('../tmpl/ast_tools');

    fconsole.log('Pack keys in templates');
    fconsole.incDeep();
    flowData.files.queue.forEach(function(file){
      if (file.type == 'template')
      {
        fconsole.log(file.relpath);
        fconsole.incDeep();

        tmplAt.walk(file.ast, {
          text: function(token){
            if (token[1])
              token[1] = packBind(token[1]);
          },
          attr: function(token){
            if (token[3] != 'class' && token[3] != 'style' && token[1])
              token[1][0] = token[1][0].map(packBind)
          }
        });

        fconsole.decDeep();
        fconsole.log();
      }
    });
    fconsole.decDeep();
    fconsole.log();


    //
    // add index to resources
    //
    fconsole.log('# Add index into resource map');
    flowData.files.add({
      jsRef: '_l10nIndex_',
      type: 'text',
      isResource: true,
      jsResourceContent: l10nIndex.content
    });


    //
    // if l10n module exists, inject index initialization
    //
    fconsole.log('# Inject index init into basis.l10n');
    if (flowData.l10n.module)
    {
      at.append(flowData.l10n.module.ast, at.parse('(' + function(){
        var parts = basis.resource('_l10nIndex_').fetch().split(/([\<\>\#])/);
        var stack = [];
        for (var i = 0; i < parts.length; i++)
        {
          switch(parts[i])
          {
            case '#': stack.length = 0; break;
            case '<': stack.pop(); break;
            case '>': break;
            default:
              if (parts[i])
              {
                stack.push(parts[i]);
                getToken(stack.join('.'));
              }
          }
        }
      } + ')()'));
    }
  }
  else
  {
    fconsole.log('Skiped.')
    fconsole.log('Use option --l10n-pack for compression');
  }
}

module.exports.handlerName = '[l10n] Compress';

//
// tools
//

function packDictionary(dict, map){
  var result = [];
  var flattenDict = {};

  // linear
  for (var dictName in dict){
    for (var key in dict[dictName]){
      flattenDict[dictName + '.' + key] = dict[dictName][key];
    }
  }

  // pack
  for (var i = 0, gap = -1; i < map.length; i++)
  {
    if (flattenDict[map[i]])
    {
      if (gap != -1)
        result.push(gap);

      result.push(flattenDict[map[i]]);

      gap = -1;
    }
    else
      gap++;
  }

  if (typeof result[result.length - 1] == 'number')
    result.pop();

  return result;
}
