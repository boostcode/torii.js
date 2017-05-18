var express = require('express');
var router = express.Router();
var action = require('../../models/action');
var tori = require('../../conf/tori.conf.js');
var mongoose = require('mongoose');
var _ = require('underscore');

/// List
router.get('/list', function(req, res) {
  // only admin or dev can change third party user
  if (req.user.isAdmin == true) {
    action.find({}, function(err, actions) {
      if (err) {
        res.json({
          success: false,
          message: err.message
        });
        return;
      }
      res.json({
        success: true,
        action: actions
      })
    });
  } else {
    res.status(403).json({
      success: false,
      message: 'User has no permission'
    });
  }
});

/// Create
router.post('/create', function(req, res) {
  // only admin or dev can change third party user
  if (req.user.isAdmin == true) {

    var sanitized = _.pick(req.body, ['name', 'collectionRef', 'field', 'action', 'creatorMail', 'editorMail', 'receiver', 'trigger', 'filter', 'from', 'to', 'message']);

    if (sanitized.name == null || sanitized.collectionRef == null || sanitized.field == null || sanitized.action == null) {
      res.json({
        success: false,
        message: 'One or more of required fields (name, collectionRef, field, action) are missing.'
      });
      return;
    }

    var newAction = new action(sanitized);

    newAction.save(function(err, saved) {
      if (err) {
        res.json({
          success: false,
          message: err.message
        });
        return;
      }
      res.json({
        success: true,
        message: 'Action created.'
      });
    });
  } else {
    res.status(403).json({
      success: false,
      message: 'User has no permission'
    });
  }
});

/// Update
router.put('/:id', function(req, res) {
  // only admin or dev can change third party user
  if (req.user.isAdmin == true) {
    // convert id from string to objectId
    var id = mongoose.Types.ObjectId(req.params.id);
    // find requested user
    action.findById(id, function(err, user) {
      if (err) {
        res.json({
          success: false,
          message: err.message
        });
        return;
      }

      // sanitize body
      req.body = _.omit(data, ['id', '__v', '_id']);

      // merge
      _.extend(action, req.body);

      // save
      action.save();

      res.json({
        success: true,
        message: 'Action updated.'
      });
    });
  } else {
    res.status(403).json({
      success: false,
      message: 'User has no permission'
    });
  }
});

/// Remove
router.delete('/:id', function(req, res) {
  // only admin or dev can change third party user
  if (req.user.isAdmin == true) {
    // convert id from string to objectId
    var id = mongoose.Types.ObjectId(req.params.id);
    // find requested user
    action.findByIdAndRemove(id, function(err, action) {
      if (err) {
        res.json({
          success: false,
          message: err.message
        });
        return;
      }

      res.json({
        success: true,
        message: 'Action removed.'
      });
    });
  } else {
    res.status(403).json({
      success: false,
      message: 'User has no permission'
    });
  }
});

module.exports = router;
