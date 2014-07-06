// ----------------------------------------------------------------------------
// File: Model3D.js
//
// Copyright (c) 2014 Voodoojs Authors
// ----------------------------------------------------------------------------



/**
 * The view that loads a model from a file.
 *
 * @constructor
 * @private
 * @extends {voodoo.View}
 */
var Model3DView_ = voodoo.View.extend({

  load: function() {
    this.base.load();

    this.loaded = false;
    this.pendingAnimation_ = null;

    this.loadModel_();
  },

  unload: function() {
    if (this.modelMesh_) {
      this.scene.remove(this.modelMesh_);
      this.triggers.remove(this.modelMesh_);
      this.modelMesh_ = null;
    }

    if (this.material_) {
      this.material_.dispose();
      this.material_ = null;
    }
  },

  loadModel_: function() {
    this.unload();

    if (this.model.format_ === Model3D.Format.JSON)
      this.loadJson_();
  },

  loadJson_: function() {
    var that = this;
    var loader = new THREE.JSONLoader();
    loader.load(this.model.modelSrc_, function(geometry, materials) {
      var mesh;

      for (var i = 0, len = i < materials.length; i < len; ++i) {
        var material = materials[i];
        if (material && material.map)
          materials.map.flipY = false;
      }

      if (that.model.animated_) {
        var material = materials[0];

        material.morphTargets = true;
        material.map.flipY = false;

        var faceMaterial = new THREE.MeshFaceMaterial(materials);
        mesh = new THREE.MorphAnimMesh(geometry, faceMaterial);
      } else {
        var faceMaterial = new THREE.MeshFaceMaterial(materials);
        mesh = new THREE.Mesh(geometry, faceMaterial);
      }

      that.modelMesh_ = mesh;

      that.scene.add(mesh);
      that.triggers.add(mesh);

      that.material_ = material;

      that.loaded = true;
    });
  },

  playAnimation_: function(animation) {
    if (!this.loaded) {
      this.pendingAnimation_ = animation;
      return;
    }

    this.modelMesh_.time = 0;
    this.modelMesh_.duration = animation.duration;

    if (animation.forward)
      this.modelMesh_.setDirectionForward();
    else
      this.modelMesh_.setDirectionBackward();

    this.modelMesh_.setFrameRange(animation.start, animation.end);
  },

  updateAnimation_: function(deltaTimeMs) {
    if (!this.loaded)
      return;

    if (this.pendingAnimation_ !== null) {
      this.playAnimation_(this.pendingAnimation_);
      this.pendingAnimation_ = null;
    }

    if (this.modelMesh_.updateAnimation) {
      this.modelMesh_.updateAnimation(deltaTimeMs);
      this.dirty();
    }
  },

  getLastTime_: function() {
    return this.loaded ? this.modelMesh_.time : 0;
  },

  setToLastFrame_: function() {
    if (this.modelMesh_.updateAnimation) {
      this.modelMesh_.time = 1;
      this.modelMesh_.updateAnimation(0);
      this.dirty();
    }
  }

});



/**
 * A 3D model loaded from a file.
 *
 * Options:
 *
 * - modelSrc {string} 3D model file to load.
 * - format {Model3D.Format} Model file format. Default is JSON.
 * - animated {boolean} Whether the model supports animations. Default is true.
 *
 * Events:
 *
 * - play
 * - stop
 * - changeModelSrc
 *
 * @constructor
 * @extends {voodoo.Model}
 *
 * @param {Object=} opt_options Options object.
 */
var Model3D = this.Model3D = voodoo.Model.extend({

  name: 'Model3D',
  organization: 'spellbook',
  viewType: Model3DView_,

  initialize: function(options) {
    options = options || {};

    this.base.initialize(options);

    log_.assert_(options.modelSrc, 'modelSrc must be valid.', options.modelSrc,
        '(Model3D::initialize)');
    log_.assert_(typeof options.modelSrc === 'string',
        'modelSrc must be a string.', options.modelSrc,
        '(Model3D::initialize)');
    this.modelSrc_ = options.modelSrc;

    if (typeof options.format !== 'undefined') {
      log_.assert_(options.format === 'json', 'format must be valid.',
          options.format, '(Model3D::initialize)');

      this.format_ = options.format;
    } else {
      this.format_ = Model3D.Format.JSON;
    }

    if (typeof options.animated !== 'undefined') {
      log_.assert_(typeof options.animated === 'boolean',
          'animated must be a boolean.',
          options.animated, '(Model3D::initialize)');

      this.animated_ = options.animated;
    } else {
      this.animated_ = true;
    }

    this.animations_ = {};
    this.animation_ = '';
    this.playing_ = false;
    this.looping_ = false;

    var that = this;

    Object.defineProperty(this, 'animation', {
      get: function() { return that.animation_; },
      enumerable: true
    });

    Object.defineProperty(this, 'looping', {
      get: function() { return that.looping_; },
      enumerable: true
    });

    Object.defineProperty(this, 'playing', {
      get: function() { return that.playing_; },
      set: function(playing) {
        if (playing)
          that.play();
        else
          that.stop();
      },
      enumerable: true
    });

    Object.defineProperty(this, 'modelSrc', {
      get: function() { return that.modelSrc_; },
      set: function(modelSrc) { that.setModelSrc(modelSrc); },
      enumerable: true
    });
  },

  update: function(deltaTime) {
    if (this.playing_) {
      var deltaTimeMs = deltaTime * 1000;

      this.view.updateAnimation_(deltaTimeMs);
      if (this.stencilView)
        this.stencilView.updateAnimation_(deltaTimeMs);

      if (!this.looping_) {
        var lastTime = this.view.getLastTime_();

        if (lastTime < this.lastTime_) {
          this.view.setToLastFrame_();
          if (this.stencilView)
            this.stencilView.setToLastFrame_();

          this.stop();
        } else {
          this.lastTime_ = lastTime;
        }
      }
    }
  }

});


/**
 * Plays or resumes an animation.
 *
 * @param {string=} opt_name Name of the animation. If this unspecified,
 *   then play() will animate the last animation played.
 *
 * @return {Model3D}
 */
Model3D.prototype.play = function(opt_name) {
  if (typeof opt_name === 'undefined') {
    log_.assert_(this.animation_ in this.animations_,
        'There is no last animation to play.', '(Model3D::play)');

    this.playing_ = true;

    return this;
  }

  log_.assert_(opt_name, 'name must be valid.', '(Model3D::setAnimation)');
  log_.assert_(opt_name in this.animations_, 'Animation does not exist.',
      opt_name, '(Model3D::setAnimation)');

  if (this.animation_ === opt_name) {
    this.playing_ = true;
    return this;
  }

  var animation = this.animations_[opt_name];
  this.animation_ = opt_name;

  this.view.playAnimation_(animation);
  if (this.stencilView)
    this.stencilView.playAnimation_(animation);

  if (!this.playing_)
    this.dispatch(new voodoo.Event('play', this));

  this.playing_ = true;
  this.looping_ = animation.loop;
  this.lastTime_ = 0;

  return this;
};


/**
 * Defines an animation.
 *
 * @param {string} name Name of the animation.
 * @param {number} start Start frame.
 * @param {number} end End frame.
 * @param {number} seconds Duration in seconds.
 * @param {boolean=} opt_loop Whether to loop the animation. Default is true.
 * @param {boolean=} opt_forward Whether to play forward, or backward. Default
 *     is true.
 *
 * @return {Model3D}
 */
Model3D.prototype.setAnimation = function(name, start, end, seconds, opt_loop,
    opt_forward) {
  log_.assert_(name, 'name must be valid.', '(Model3D::setAnimation)');
  log_.assert_(typeof name === 'string', name, 'name must be a string.',
      '(Model3D::setAnimation)');
  log_.assert_(typeof start === 'number', 'start must be a number.',
      start, '(Model3D::setAnimation)');
  log_.assert_(start >= 0, 'start must be >= 0.', start,
      '(Model3D::setAnimation)');
  log_.assert_(typeof end === 'number', 'end must be a number.',
      end, '(Model3D::setAnimation)');
  log_.assert_(end >= 0, 'end must be >= 0.', end,
      '(Model3D::setAnimation)');
  log_.assert_(typeof seconds === 'number', 'seconds must be a number.',
      seconds, '(Model3D::setAnimation)');
  log_.assert_(seconds >= 0, 'seconds must be >= 0.', seconds,
      '(Model3D::setAnimation)');

  this.animations_[name] = {
    start: start,
    end: end,
    duration: seconds * 1000,
    loop: typeof opt_loop !== 'undefined' ? opt_loop : true,
    forward: typeof opt_forward === 'undefined' ? true : opt_forward
  };

  return this;
};


/**
 * Sets the model file. This stops all current animations.
 *
 * @param {string} modelSrc Model filename.
 *
 * @return {Model3D}
 */
Model3D.prototype.setModelSrc = function(modelSrc) {
  log_.assert_(modelSrc, 'modelSrc must be valid.', modelSrc,
      '(Model3D::setModelSrc)');
  log_.assert_(typeof modelSrc === 'string', 'modelSrc must be a string.',
      modelSrc, '(Model3D::setModelSrc)');

  if (this.modelSrc_ === modelSrc)
    return this;

  this.modelSrc_ = modelSrc;

  this.stop();

  this.dispatch(new voodoo.Event('changeModelSrc', this));

  if (this.view) this.view.loadModel_();
  if (this.stencilView) this.stencilView.loadModel_();

  return this;
};


/**
 * Pauses an animation.
 *
 * @return {Model3D}
 */
Model3D.prototype.stop = function() {
  if (this.playing_)
    this.dispatch(new voodoo.Event('stop', this));

  this.playing_ = false;

  return this;
};


/**
 * Gets the currently playing animation. Readonly.
 *
 * @type {string}
 */
Model3D.prototype.animation = '';


/**
 * Gets whether the animation is looping.
 *
 * @type {boolean}
 */
Model3D.prototype.looping = false;


/**
 * Gets or sets the current model filename.
 *
 * @type {string}
 */
Model3D.prototype.modelSrc = '';


/**
 * Gets or sets whether playing an animation.
 *
 * @type {boolean}
 */
Model3D.prototype.playing = false;


/**
 * Enumeration for the file format.
 *
 * @enum {string}
 */
Model3D.Format = {
  JSON: 'json'
};