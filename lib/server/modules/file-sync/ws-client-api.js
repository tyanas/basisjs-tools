/* eslint-env browser */
/* global api, sendToServer, socket, DEBUG, basis */

/**
* @class
*/
var File = function(filename, content, digest){
  this.filename = filename;
  this.value = content;
  this.digest = digest;

  fileMap[filename] = this;

  api.notifications.set(['new', this.filename, this.value]);
};

File.prototype = {
  set: function(content){
    if (this.value != content)
    {
      this.value = content;
      api.notifications.set(['update', this.filename, this.value]);
    }
  },
  read: function(callback){
    var self = this;
    sendToServer('readFile', this.filename, function(err, file){
      self.digest = !err ? file.digest : null;
      self.set(!err ? file.content : '');

      if (typeof callback == 'function')
        callback.call(self);
    });
  },
  save: function(content, callback){
    this.set(content);

    var self = this;
    sendToServer('saveFile', this.filename, content, true, function(err, file){
      self.digest = digest;
      if (typeof callback == 'function')
        callback.call(self, err);

      if (DEBUG)
      {
        if (err)
          console.log('basisjs-tools: File `' + self.filename + '` error on save: ', err);
        else
          console.log('basisjs-tools: File `' + self.filename + '` successfuly saved');
      }
    });
  }
};


//
// main part
//

var fileMap = {};

function getFile(filename, autocreate){
  var file = fileMap[filename];

  if (!file && autocreate)
    file = createFile(filename);

  return file;
}

function createFile(filename, content, digest){
  return fileMap[filename] || new File(filename, content, digest);
}

function updateFile(filename, content, digest){
  var file = getFile(filename, true);

  file.digest = digest;
  file.set(content);
}

function removeFile(filename){
  var file = fileMap[filename];

  if (file)
  {
    delete fileMap[filename];
    api.notifications.set(['remove', filename]);
  }
}


//
// API
//

api.getAppProfile = function(callback){
  sendToServer('getAppProfile', location.href, callback);
};
api.getBundle = function(indexFilename, callback){
  sendToServer('getBundle', indexFilename || location.href, callback);
};
api.getFile = getFile;
api.getFiles = function(){
  var result = [];
  for (var key in fileMap)
    result.push(fileMap[key]);
  return result;
};
api.createFile = function(filename){
  sendToServer('createFile', filename, function(err){
    if (err)
      console.error(err);
    else
      createFile(filename, '');
  });
};
api.openFile = function(filename){
  sendToServer('openFile', filename, function(err){
    if (err)
      console.error(err);
  });
};

// deprecated
api.getFileGraph = function(callback){
  sendToServer('getAppProfile', location.href, callback);
};


//
// socket
//

socket.on('connect', function(){
  var clientKnownFiles = [];

  for (var fn in fileMap)
    if (fileMap.hasOwnProperty(fn))
      clientKnownFiles.push({
        filename: fn,
        digest: fileMap[fn].digest
      });

  socket.emit('file:handshake', clientKnownFiles, function(serverKnownFiles){
    for (var i = 0; i < serverKnownFiles.length; i++)
      createFile(serverKnownFiles[i].filename, undefined, serverKnownFiles[i].digest);
  });
});

socket.on('file:new', function(data){
  createFile(data.filename, data.content, data.digest);

  if (DEBUG)
    console.log('basisjs-tools: New file', data);
});

socket.on('file:update', function(data){
  updateFile(data.filename, data.content, data.digest);

  if (DEBUG)
    console.log('basisjs-tools: File updated', data);
});

socket.on('file:delete', function(data){
  removeFile(data.filename);

  if (DEBUG)
    console.log('basisjs-tools: File deleted', data);
});


//
// deprecated part for basis.js
//

if (typeof basis != 'undefined' && basis.namespaces_ && basis.namespaces_['basis.data'])
{
  // NOTE: use namespaces_ to avoid warnings when access to implicit
  // namespace extensions (since basis.js 1.4)
  var basisData = basis.namespaces_['basis.data'].exports || basis.data;
  var basisDataFileMap = {};
  var files = new basisData.Dataset();
  var serverState = new basisData.Object({
    data: {
      isOnline: api.isOnline.value
    }
  });

  api.isOnline.attach(function(value){
    serverState.update({
      isOnline: value
    });
  });
  api.notifications.attach(function(action, filename, content){
    switch (action)
    {
      case 'new':
        files.add(basisDataFileMap[filename] = new BasisDataFile({
          data: {
            filename: filename,
            content: content
          }
        }));
        break;
      case 'update':
        basisDataFileMap[filename].update({
          content: content
        });
        break;
      case 'remove':
        basisDataFileMap[filename].destroy();
        break;
    }
  });

  var BasisDataFile = basisData.Object.subclass({
    state: basisData.STATE.UNDEFINED,
    read: function(){
      var self = this;

      this.setState(basisData.STATE.PROCESSING);

      fileMap[this.data.filename].read(function(){
        self.setState(basisData.STATE.READY);
      });
    },
    save: function(content){
      var self = this;

      this.setState(basisData.STATE.PROCESSING);

      fileMap[this.data.filename].save(content, function(err){
        if (err)
          self.setState(basisData.STATE.ERROR, err);
        else
          self.setState(basisData.STATE.READY);
      });
    },

    syncContentWithResource: function(content){
      if (!basis.resource.isDefined || basis.resource.isDefined(this.data.filename, true))
        basis.resource(this.data.filename).update(content);
    },

    // for new basis
    emit_update: function(delta){
      basisData.Object.prototype.emit_update.call(this, delta);

      if ('filename' in delta || 'content' in delta)
      {
        fileMap[this.data.filename].set(this.data.content);
        this.syncContentWithResource(this.data.content);
      }
    },
    // for previous basis version
    event_update: function(delta){
      basisData.Object.prototype.event_update.call(this, delta);

      if ('filename' in delta || 'content' in delta)
      {
        fileMap[this.data.filename].set(this.data.content);
        basis.resource(this.data.filename).update(this.data.content);
      }
    },

    destroy: function(){
      this.syncContentWithResource(undefined);
      basisData.Object.prototype.destroy.call(this);
    }
  });


  //
  // export
  //

  basis.devtools = basis.object.extend(api, {
    serverState: serverState,
    files: files,
    getFile: function(filename){
      getFile(filename, true);
      return basisDataFileMap[filename];
    }
  });
}