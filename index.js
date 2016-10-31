'use strict';

var Accessory, Service, Characteristic;
let huejay = require('huejay');
var hue;

module.exports = function(homebridge) {
	Accessory = homebridge.platformAccessory;
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	var inherits = require('util').inherits;
	
	homebridge.registerAccessory("homebridge-hue-sensor-data", "HueSensor", HueSensorAccessory);
}

function HueSensorAccessory(log, config, api) {
	this.log = log;
	this.config = config;
	this.name = config.name || 'Hue Sensor';
	this.temperature = 0.0;
	this.lightLevel = 0.0001;
	this.presence = true;
	
	var platform = this;
	
	hue = new huejay.Client({
            host: config.ip,
            port: config.port,
            username: config.username, 
            timeout: 15000            // Optional, timeout in milliseconds (15000 is the default)
		});
	
	setInterval(function() {
		hue.sensors.getAll().then(sensors => {	
			for (let sensor of sensors) {
				var uniqueid = sensor.attributes.attributes.uniqueid;
				if (config.sensors[uniqueid] !== undefined) {
					if (config.sensors[uniqueid] === 'ZLLTemperature') {
						platform.temperature = sensor.state.attributes.attributes.temperature / 100;
					} else if (config.sensors[uniqueid] === 'ZLLLightLevel') {
						var lightlevel = sensor.state.attributes.attributes.lightlevel;
						if (lightlevel < 0.0001) {
							lightlevel = 0.0001;
						}
						platform.lightLevel = lightlevel;
					} else if (config.sensors[uniqueid] === 'ZLLPresence') {
						platform.presence = sensor.state.attributes.attributes.presence;
					}
				}
			}
		});
	}, 10000);
}

//	Create custom characteristic.

HueSensorAccessory.prototype = {
	getTemperature: function(callback) {
		callback(null, this.temperature);
	},
	
	identify: function(callback) {
		this.log('Identify');
		console.log('Identify');
		callback();
	},
	
	getLightLevel: function(callback) {
		callback(null, this.lightLevel);
	},
	
	getPresence: function(callback) {
		callback(null, this.presence);
	},
	getServices: function() {
		
		var informationService;
		var sensors = [];
		
		informationService = new Service.AccessoryInformation()
        			.setCharacteristic(Characteristic.Manufacturer, 'Philips')
        			.setCharacteristic(Characteristic.Model, 'Hue Sensor')
        			.setCharacteristic(Characteristic.SerialNumber, '');
		sensors.push(informationService);
		
		for (var uniqueid in this.config.sensors) {
			var sensorType = this.config.sensors[uniqueid];
			
			if (sensorType === 'ZLLTemperature') {
				var sensor = new Service.TemperatureSensor("Temperature");
				sensor.getCharacteristic(Characteristic.CurrentTemperature)
				      .on('get', this.getTemperature.bind(this));
				sensors.push(sensor);
			} else if (sensorType === 'ZLLLightLevel') {
				var sensor = new Service.LightSensor("Light Level");
				sensor.getCharacteristic(Characteristic.CurrentAmbientLightLevel)
				      .on('get', this.getLightLevel.bind(this));
				sensors.push(sensor);
			} else if (sensorType === 'ZLLPresence') {
				var sensor = new Service.OccupancySensor("Presence");
				sensor.getCharacteristic(Characteristic.OccupancyDetected)
				      .on('get', this.getPresence.bind(this));
				sensors.push(sensor);
			}
		}

		return sensors;
	}
};