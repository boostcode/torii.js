var express = require('express');
var router = express.Router();
var account = require('../models/account');
var action = require('../models/action');
var oID = require('mongodb').ObjectID;
var fs = require('fs');
var _ = require('underscore');
var rbac = require('mongoose-rbac');
var permission = rbac.Permission;
var tori = require('../conf/tori.conf.js');
var actionFunction = require('../routes/action');
var template = require('template');
var S = require('string');

// list
router.post('/list.json', function(req, res) {
  var structure = req.db.collection('tori_structure');

  structure.find({}).toArray(function(err, collections) {

    if (err) {
      res.send(err);
      return;
    }

    var colls = [];

    if (collections) {

      collections.forEach(function(col) {

        var colName = col.nome_collezione;

        if ((colName != 'system') && (colName != 'tori_structure') && (colName != 'tori_removed')) {

          colls.push({
            'name': colName,
            'import': col.import,
            'export': col.export
          });
        }
      });
    }

    var totElems = colls.length;

    if (req.body.iDisplayLength && req.body.iDisplayStart) {
      if (req.body.iDisplayLength > 0) {
        colls = colls.splice(req.body.iDisplayStart, req.body.iDisplayLength);
      }
    }

    res.send({
      sEcho: parseInt(req.body.sEcho),
      iTotalRecords: totElems,
      iTotalDisplayRecords: colls.length,
      aaData: colls,
      serverTime: new Date().getTime()
    });

  });
});

// check for updates
router.post('/:collection_name/hasupdate', function(req, res) {

  req.user.can('api-read', req.params.collection_name, function(err, can) {
    if (err) {
      res.send(err);
      return;
    }

    if (can || req.user.isDev) {
      var collection = req.db.collection(req.params.collection_name);

      var data = req.body.last_update;

      var query = {
        last_update: {
          "$gt": parseFloat(data)
        }
      };

      collection.find(query).toArray(function(err, items) {
        res.send({
          status: 'ok',
          data: items.length
        });
      });
    } else {
      res.send(401, 'user not allowed');
    }
  });
});

// document list
router.post('/:collection_name/documents.json', function(req, res) {

  req.user.can('api-read', req.params.collection_name, function(err, can) {
    if (err) {
      res.send(err);
      return;
    }
    if (can || req.params.collection_name == 'tori_structure' || req.user.isDev) {

      var collezione;
      var objRemoved;

      if (req.body.queryRemoved) {
        collezione = req.db.collection('tori_removed');
        collezione.find(req.body.queryRemoved).toArray(function(err, items) {
          objRemoved = items;
        });
      }

      var collezione = req.db.collection(req.params.collection_name);

      var ordering = {};
      var orderStr;

      var collectionStructure = req.db.collection('tori_structure');

      collectionStructure.find({
        'nome_collezione': req.params.collection_name
      }).toArray(function(err, coll) {

        if (err) {
          res.send(err);
          return;
        }

        if (req.params.collection_name != 'tori_structure') {

          var orderKey = null;

          coll[0].struttura.forEach(function(element) {

            if (element.order) {
              orderKey = element.field_name;

              //trick
              var key = element.field_name;

              if (element.order == 'asc') {

                ordering[key] = 1;

              } else {

                ordering[key] = -1;

              }

            }

          });

        }

        ordering['_id'] = -1;

        var query;

        if (req.body.sSearch) {

          query = [];

          coll[0].struttura.forEach(function(field) {

            var filter = {};

            filter[field.field_name] = {
              $regex: ".*" + req.body.sSearch + ".*",
              $options: "i"
            };

            console.log('Fs: ' + JSON.stringify(filter));

            query.push(filter);

          });

          query = {
            $or: query
          };

        }


        if (req.body.query) {
          query = req.body.query;
        }


        // Query datatables
        if (req.body.queryDataTablesCampo && req.body.queryDataTablesRicerca) {

          query = [];

          var elm = req.body.queryDataTablesRicerca.split(',');

          elm.forEach(function(term) {

            var filterD = {};

            filterD[req.body.queryDataTablesCampo] = {
              $regex: ".*" + term + ".*",
              $options: "i"
            };

            query.push(filterD);

          });

          query = {
            $or: query
          };

        }

        account.find({}, function(err, users) {

          collezione.find(query).sort(ordering).toArray(function(err, items) {

            var totElems = items.length;

            // TODO: sub filter elements

            // order according selection
            // let's use underscore to sort but need to retrieve the element of the collection structu

            var totElementsFiltered = items.length;

            if (req.body.iDisplayLength && req.body.iDisplayStart) {
              items = items.splice(req.body.iDisplayStart, req.body.iDisplayLength);
            }

            items.forEach(function(item) {
              if (item.owner) {
                users.forEach(function(user) {
                  if (JSON.stringify(item.owner) == JSON.stringify(user._id)) {
                    var usrName = (user.name) ? user.name : '';
                    var usrSurname = (user.surname) ? user.surname : '';
                    item.owner = usrName + ' ' + usrSurname + ' ' + user.username;
                  }
                });
              }
            });

            res.send({
              sEcho: parseInt(req.body.sEcho),
              iTotalRecords: totElems,
              iTotalDisplayRecords: totElementsFiltered,
              aaData: items,
              objRemoved: objRemoved,
              serverTime: new Date().getTime()
            });
          });
        });


      });
    }
  });
});


// create
router.post('/:collection_name/create', function(req, res) {
  req.db.createCollection(req.params.collection_name, function(err, col) {
    if (err) {
      res.send(err);
      return;
    }

    var struct = req.db.collection('tori_structure');

    // lovercase name of collection
    req.body.dati.nome_collezione = req.body.dati.nome_collezione.toLowerCase();

    struct.insert(req.body.dati, {
      w: 1
    }, function(err, result) {

      if (err) {
        res.send(err);
        return;
      }

      var cleanName = req.body.dati.nome_collezione.replace(/ /g, '');

      permission.create([{
          subject: cleanName,
          action: 'backend-read'
        },
        {
          subject: cleanName,
          action: 'backend-write'
        },
        {
          subject: cleanName,
          action: 'api-read'
        },
        {
          subject: cleanName,
          action: 'api-write'
        }
      ], function(err) {
        if (err) {
          res.send(err);
          return;
        }
      });

      res.send({
        status: 'ok'
      });

    });
  });
});

// remove
router.post('/:collection_name/delete', function(req, res) {
  req.user.can('api-write', req.params.collection_name, function(err, can) {
    if (err) {
      res.send(err);
      return;
    }

    if (can || req.user.isDev) {
      req.db.dropCollection(req.params.collection_name, function(err, coll) {
        if (err) {
          res.send(err);
          return;
        }

        var collection = req.db.collection('tori_structure');

        collection.remove({
          nome_collezione: req.params.collection_name
        }, {
          w: 1
        }, function(err, result) {
          if (err) {
            res.send(err);
          }

          res.send({
            status: 'ok',
            data: result
          });
        });

        permission.remove({
          subject: req.params.collection_name
        }, function(err) {
          if (err) {
            res.send(err);
            return;
          }
        });

      });
    } else {
      res.send(401, 'user not allowed');
    }
  });
});

// insert
router.post('/:collection_name/insert', function(req, res) {
  req.user.can('api-write', req.params.collection_name, function(err, can) {
    if (can || req.user.isDev) {
      var collection = req.db.collection(req.params.collection_name);

      var value = req.body.valori;

      value.last_update = new Date().getTime();

      value.text = '';

      value.owner = req.user._id;

      var responseJ = {};

      collection.insert(value, {
        w: 1
      }, function(err, result) {
        collection.ensureIndex('text', function() {});

        responseJ.status = 'ok';
        responseJ.data = result;

        action.find({
          $and: [{
              trigger: 'create'
            },
            {
              collectionName: req.params.collection_name
            }
          ]
        }, function(err, actions) {

          var actionToSend = [];

          actions.forEach(function(act) {

            if (act.action == 'email') {

              var msgVal = [];

              act.message.forEach(function(msg) {

                msgVal.push(template(msg, {
                  creator: req.user,
                  item: value
                }));

              });

              var mailOptions = {
                from: tori.conf.mail.from,
                to: '',
                subject: act.name + ' - ' + result[0]._id,
                text: msgVal
              };

              var destArr = [];

              // If the CREATOR is one of the receivers
              if (act.creatorMail == true) {

                // I add the CREATOR
                destArr.push(req.user.username);

              }

              var other = act.receiver.split(',');

              other.forEach(function(msgO) {

                destArr.push(S(msgO).trim().s);

              });

              mailOptions["to"] = destArr;

              if (act.message.length > 1) {
                actionToSend.push(mailOptions);
              } else {
                mailOptions["text"] = mailOptions["text"][0];
                req.body.mailActions = [mailOptions];
                actionFunction.sendMail(req);
              }

            } else if (act.action == 'push') {
              // TODO add push
            }

          });

          if (actionToSend.length > 0) {
            responseJ.actions = actionToSend;
          }
          res.send(responseJ);
        });
      });
    } else {
      res.send(401, 'user not allowed');
    }
  });
});

// remove all documents from collection
router.post('/:collection_name/delete_all', function(req, res) {
  req.user.can('api-write', req.params.collection_name, function(err, can) {
    if (err) {
      res.send(err);
      return;
    }

    if (can || req.user.isDev) {
      var collection = req.db.collection(req.params.collection_name);

      collection.remove(function(err, result) {
        if (err) {
          res.send(err);
          return;
        }

        res.send({
          status: 'ok',
          data: result
        });
      });

    } else {
      res.send(401, 'user not allowed');
    }
  });
});

// show document in collection
router.post('/:collection_name/:document_id', function(req, res) {
  req.user.can('api-read', req.params.collection_name, function(err, can) {

    if (err) {
      res.send(err);
      returnl;
    }

    if (can || req.user.isDev) {

      var collection = req.db.collection(req.params.collection_name);

      if (req.params.document_id) {
        var objectId = new oID.createFromHexString(req.params.document_id);
        //var objectId = req.params.document_id;
      }

      var query = {};

      if (objectId) {
        query = {
          _id: objectId
        };
      }

      collection.find(query).toArray(function(err, items) {

        if (err) {
          res.send(err);
          return;
        }

        res.send({
          status: 'ok',
          data: items
        });

      });

    } else {
      res.send(401, 'user not allowed');
    }
  });
});

// update document
router.post('/:collection_name/:document_id/update', function(req, res) {

  req.user.can('api-write', req.params.collection_name, function(err, can) {

    if (err) {
      res.send(err);
      return;
    }

    var collection = req.db.collection(req.params.collection_name);

    var values = req.body.valori;

    values.last_update = new Date().getTime();

    var objectId = new oID.createFromHexString(req.params.document_id);

    collection.find({
      _id: objectId
    }).toArray(function(err, items) {

      if (err) {
        res.send(err);
        return;
      }

      var keysOfValuesChanged = [];

      var item;

      if (items.length > 0) {

        item = items[0];

        for (var key in item) {

          if (item.hasOwnProperty(key)) {

            if (!_.isEqual(values[key], item[key])) {

              keysOfValuesChanged.push(key);

            }

          }

        }

        keysOfValuesChanged = _.difference(keysOfValuesChanged, ['_id', 'text', 'last_update', 'owner']);

      }

      // aggiorno solo dopo aver controllato quali valori sono da modificare
      collection.update({
        _id: objectId
      }, {
        $set: values
      }, {
        w: 1
      }, function(err, result) {

        if (err) {
          res.send(err);
          return;
        }
        /*
        res.send({
          status: 'ok',
          data: result
        });*/

        var responseJ = {};

        responseJ.status = 'ok';
        responseJ.data = result;

        action.find({
          $and: [{
              trigger: 'edit'
            },
            {
              collectionName: req.params.collection_name
            },
            {
              field: {
                $in: keysOfValuesChanged
              }
            }
          ]
        }, function(err, actions) {

          var actionToSend = [];

          var actionsOk = [];

          actions.forEach(function(act) {

            if (act.filter == 'value') {

              actionsOk.push(act);

            } else if (act.filter == 'to') {

              if (_.isEqual(values[act.field], act.to)) {

                actionsOk.push(act);

              }

            } else if (act.filter == 'from') {

              if (_.isEqual(item[act.field], act.from)) {

                actionsOk.push(act);

              }

            } else if (act.filter == 'fromto') {

              // TO DO

              actionsOk.push(act);

            }

          });

          collection.find({
            _id: objectId
          }).toArray(function(err, itemsModified) {

            if (err) {
              res.send(err);
              return;
            }

            var keysOfValuesChanged = [];

            var itemModified;

            if (itemsModified.length > 0) {

              itemModified = itemsModified[0];

              // I find the email of CREATOR
              account.findById(item.owner, '_id username role isAdmin isDev name surname extraFields', function(err, user) {

                if (err) {
                  res.send(err);
                  return;
                }

                actionsOk.forEach(function(act) {

                  if (act.action == 'email') {

                    // Replace key with parameters

                    var msgVal = [];

                    act.message.forEach(function(msg) {

                      msgVal.push(template(msg, {
                        creator: user,
                        item: itemModified,
                        editor: req.user
                      }));

                    });

                    // Email options
                    var mailOptions = {
                      from: tori.conf.mail.from,
                      to: '',
                      subject: act.name + ' - ' + req.params.document_id,
                      text: msgVal
                    };

                    var destArr = [];

                    // If there is also the EDITOR I add him
                    if ((act.editorMail == true)) {

                      destArr.push(req.user.username);

                    }

                    // If the CREATOR is one of the receivers
                    if (act.creatorMail == true) {

                      // I add the CREATOR
                      destArr.push(user.username);

                    }

                    var other = act.receiver.split(',');

                    other.forEach(function(msgO) {

                      destArr.push(S(msgO).trim().s);

                    });

                    mailOptions["to"] = destArr;

                    // If only 1 message mail immediately otherwise I send message to the page
                    if (act.message.length > 1) {
                      actionToSend.push(mailOptions);
                    } else {
                      mailOptions["text"] = mailOptions["text"][0];
                      req.body.mailActions = [mailOptions];
                      actionFunction.sendMail(req);
                    }

                  } else if (act.action == 'push') {
                    // TODO add push
                  }

                });

                if (actionToSend.length > 0) {
                  responseJ.actions = actionToSend;
                }
                res.send(responseJ);

              });


            }

          });

          // close action find
        });


        // close update
      });

      // close find
    });

    // close api
  });

  // close function
});

// remove document
router.post('/:collection_name/:document_id/delete', function(req, res) {
  req.user.can('api-write', req.params.collection_name, function(err, can) {
    if (err) {
      res.send(err);
      return;
    }

    if (can || req.user.isDev) {
      var collection = req.db.collection(req.params.collection_name);

      var objectId = new oID.createFromHexString(req.params.document_id);

      var query = {};

      if (objectId) {
        query = {
          _id: objectId
        };
      }

      var objToDel = {};
      objToDel['collection'] = req.params.collection_name;
      objToDel['remove_date'] = new Date().getTime();

      collection.find(query).toArray(function(err, items) {
        if (err) {
          res.send(err);
          return;
        }
        objToDel['object_removed'] = JSON.stringify(items[0]);
      });

      collection.remove({
          _id: objectId
        }, {
          w: 1
        },
        function(err, result) {

          if (err) {
            res.send(err);
            return;
          }

          if (objToDel.collection != 'tori_removed') {
            collection = req.db.collection('tori_removed');

            collection.insert(objToDel, {
              w: 1
            }, function(err, result) {
              if (err) {
                res.send(err);
                return;
              }
            });
          }

          res.send({
            status: 'ok',
            data: result
          });
        });

    } else {
      res.send(401, 'user not allowed');
    }
  });
});

module.exports = router;
