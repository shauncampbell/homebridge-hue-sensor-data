'use strict';

var Accessory, Service, Characteristic;
let huejay = require('huejay');
var moment = require('moment');
var hue;

module.exports = function(homebridge) {
	Accessory = homebridge.platformAccessory;
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	var inherits = require('util').inherits;
	
	//	Create the characteristic for the button press id
	Characteristic.ButtonPressed = function() {
		Characteristic.call(this, 'Button Pressed','0000006E-0000-1000-8000-0037BB765301');
		this.setProps({
			format: Characteristic.Formats.INT,
			unit: Characteristic.Units.NONE,
			maxValue: 4,
			minValue: 0,
			minStep: 1,
			perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
		});
		this.value = this.getDefaultValue();
	};
	inherits(Characteristic.ButtonPressed, Characteristic);
	Characteristic.ButtonPressed.UUID = '0000006E-0000-1000-8000-0037BB765301';
	
	//	Create the characteristic for the button name
	Characteristic.ButtonName = function() {
		Characteristic.call(this, 'Button Name','0000006E-0000-1000-8000-0037BB765302');
		this.setProps({
			format: Characteristic.Formats.STRING,
			perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
		});
		this.value = this.getDefaultValue();
	};
	inherits(Characteristic.ButtonName, Characteristic);
	Characteristic.ButtonName.UUID = '0000006E-0000-1000-8000-0037BB765302';
	
	homebridge.registerAccessory("homebridge-hue-sensor-data", "HueSensor", HueSensorAccessory);
}

function HueSensorAccessory(log, config, api) {
	this.log = log;
	this.config = config;
	this.name = config.name || 'Hue Sensor';
	this.temperature = 0.0;
	this.lightLevel = 0.0001;
	this.presence = true;
	this.switchBtn = 0;
	this.switchButtonLastPressed = moment('1970-01-01');
	
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
					} else if (config.sensors[uniqueid] === 'ZLLSwitch') {
						platform.switchBtn = sensor.state.attributes.attributes.buttonevent;
						platform.switchButtonLastPressed = moment(sensor.state.attributes.attributes.lastupdated);
					}
				}
			}
		});
	}, config.refreshInterval);
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
	getDimmerSwitchButtonPress: function(callback) {
		var buttonStates = {
			1000: 0, 1001: 0, 1002: 1, 1003: 1,
			2000: 0, 2001: 0, 2002: 2, 2003: 2,
			3000: 0, 3001: 0, 3002: 3, 3003: 3,
			4000: 0, 4001: 0, 4002: 4, 4003: 4
		};
		var state = buttonStates[this.switchBtn];
		callback(null, state);
	},
	getDimmerSwitchButtonName: function(callback) {
		var buttonStates = {
			1000: 'None', 1001: 'None', 1002: 'On', 1003: 'On',
			2000: 'None', 2001: 'None', 2002: 'Up', 2003: 'Up',
			3000: 'None', 3001: 'None', 3002: 'Down', 3003: 'Down',
			4000: 'None', 4001: 'None', 4002: 'Off', 4003: 'Off'
		};
		var state = buttonStates[this.switchBtn];
		callback(null, state);
	},
	getDimmerSwitchButtonActive: function(callback) {
		var on = this.switchButtonLastPressed.isAfter(moment().subtract(10, 'seconds'));
		callback(null, on);
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
			} else if (sensorType === 'ZLLSwitch') {
				var sensor = new Service.Switch("Dimmer");
				
				sensor.addCharacteristic(Characteristic.ButtonPressed);
				sensor.addCharacteristic(Characteristic.ButtonName);
				
				sensor.getCharacteristic(Characteristic.ButtonPressed)
				      .on('get', this.getDimmerSwitchButtonPress.bind(this));
				
				sensor.getCharacteristic(Characteristic.ButtonName)
				      .on('get', this.getDimmerSwitchButtonName.bind(this));
					  
				sensor.getCharacteristic(Characteristic.On)
				      .on('get', this.getDimmerSwitchButtonActive.bind(this));
				
				sensors.push(sensor);
			}
		}

		return sensors;
	}
};