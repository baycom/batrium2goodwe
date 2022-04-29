var util=require('util');
var can = require('socketcan');
var buffer = require('buffer');
var Parser = require('binary-parser').Parser;
const commandLineArgs = require('command-line-args')

const optionDefinitions = [
	{ name: 'bms', alias: 'b', type: Boolean },
	{ name: 'inverter', alias: 'i', type: String },
	{ name: 'address', alias: 'a', type: Number },
	{ name: 'mqttclientid', alias: 'm', type: String }
  ];

const options = commandLineArgs(optionDefinitions)

var channelGoodWe  = can.createRawChannel("can0", true /* ask for timestamps */);
var channelBatrium = can.createRawChannel("can1", true /* ask for timestamps */);

channelGoodWe.start();
channelBatrium.start();

//Device versioning
const Batrium00Parser = new Parser()
        .uint16le('HardwareVersion')
        .uint16le('FirmwareVersion')
        .uint32le('DeviceSerialNo')
        ;
//Cell voltage limits
const Batrium01Parser = new Parser()
        .uint16le('MinCellVoltage', { formatter: (x) => {return x/1000.0;}})
        .uint16le('MaxCellVoltage', { formatter: (x) => {return x/1000.0;}})
        .uint16le('AvgCellVoltage', { formatter: (x) => {return x/1000.0;}})
        .uint8('MinVAtCell')
        .uint8('MaxVAtCell')
        ;
//Cell temperature limits
const Batrium02Parser = new Parser()
        .uint8('MinCellTemperature', { formatter: (x) => {return x-40.0;}})
        .uint8('MaxCellTemperature', { formatter: (x) => {return x-40.0;}})
        .uint8('AvgCellTemperature', { formatter: (x) => {return x-40.0;}})
        .uint8('MinTAtCell')
        .uint8('MaxTAtCell')
        ;
//Cell bypass summary
const Batrium03Parser = new Parser()
        .uint8('NumberInBypass')
        .uint8('NumberInInitialBypass')
        .uint8('NumberInFinalBypass')
        ;
//Shunt power monitoring
const Batrium04Parser = new Parser()
        .int16le('ShuntVoltage', { formatter: (x) => {return x/10.0;}})
        .int16le('ShuntAmperes', { formatter: (x) => {return x/10.0;}})
        .int16le('ShuntPower', { formatter: (x) => {return x*10.0;}})
        ;
//Shunt state monitoring
const Batrium05Parser = new Parser()
        .int16le('SoC', { formatter: (x) => {return x/100.0;}})
        .int16le('SoH', { formatter: (x) => {return x/100.0;}})
        .uint16le('RemainingAh', { formatter: (x) => {return x/10.0;}})
        .uint16le('NominalCapacityAh', { formatter: (x) => {return x/10.0;}})
        ;
//Remote control target limits
const Batrium06Parser = new Parser()
        .uint16le('ChargeTargetVoltage', { formatter: (x) => {return x/10.0;}})
        .uint16le('ChargeTargetAmp', { formatter: (x) => {return x/10.0;}})
        .uint16le('DischargeTargetVoltage', { formatter: (x) => {return x/10.0;}})
        .uint16le('DischargeTargetAmp', { formatter: (x) => {return x/10.0;}})
        ;
//Control flag logic state
const Batrium07Parser = new Parser()
        .uint8('CriticalControlFlags')
        .uint8('ChargeControlFlags')
        .uint8('DischargeControlFlags')
        .uint8('HeatControlFlags')
        .uint8('CoolControlFlags')
        .uint8('CellBalancingFlags')
        ;

//Inverter
const GoodWe420Parser = new Parser()
        .string('Signature',    { encoding: 'utf8', length: 8, stripNull: true })
        ;

const GoodWe425Parser = new Parser()
        .uint16le('BatteryVoltage', { formatter: (x) => {return x/10.0;}})
        .int16le('BatteryCurrent', { formatter: (x) => {return x/10.0;}})
        ;

var BMS = [];
var GoodWe = [];

function BatriumGetPayload(msg) {
        if(msg.id==0x00) {
          BMS["Batrium00"] = Batrium00Parser.parse(msg.data);
        }
        if(msg.id==0x01) { 
          BMS["Batrium01"] = Batrium01Parser.parse(msg.data);
        }
        if(msg.id==0x02) {
          BMS["Batrium02"] = Batrium02Parser.parse(msg.data);
        }
        if(msg.id==0x03) {
          BMS["Batrium03"] = Batrium03Parser.parse(msg.data);
        }
        if(msg.id==0x04) {
          BMS["Batrium04"] = Batrium04Parser.parse(msg.data);
        }
        if(msg.id==0x05) {
          BMS["Batrium05"] = Batrium05Parser.parse(msg.data);
        }
        if(msg.id==0x06) {
          BMS["Batrium06"] = Batrium06Parser.parse(msg.data);
        }
        if(msg.id==0x07) {
          BMS["Batrium07"] = Batrium07Parser.parse(msg.data);
        }
//        console.log(util.inspect(BMS));
}

function GoodWeGetPayload(msg) {
        if(msg.id==0x420) {
          GoodWe["GoodWe420"] = GoodWe420Parser.parse(msg.data);
        }
        if(msg.id==0x425) { 
          GoodWe["GoodWe425"] = GoodWe425Parser.parse(msg.data);
        }
//        console.log(util.inspect(GoodWe));
}

function toHex(number) {
  return ("00000000" + number.toString(16)).slice(-8);
}

function BatriumPacket(msg) {
/*
  console.log('Batrium: (' + (msg.ts_sec + msg.ts_usec / 1000000).toFixed(6) + ') ' +
    toHex(msg.id).toUpperCase() + '#' + msg.data.toString('hex').toUpperCase());
*/
  BatriumGetPayload(msg);
}

function GoodWePacket(msg) {
/*
  console.log('GoodWe: (' + (msg.ts_sec + msg.ts_usec / 1000000).toFixed(6) + ') ' +
    toHex(msg.id).toUpperCase() + '#' + msg.data.toString('hex').toUpperCase());
*/
//    console.log(msg.data.toString());
  GoodWeGetPayload(msg);
}

channelGoodWe.addListener("onMessage", GoodWePacket);
channelBatrium.addListener("onMessage", BatriumPacket);

function GoodWeSend(id, data) {
  var msg = {
    id: id,
    length: data.length,
    data: data
  };
//  console.log(util.inspect(msg));
  channelGoodWe.send(msg);
}

function GoodWeIntervalFunc() {
  
  if(BMS['Batrium02'] && BMS['Batrium04'] && BMS['Batrium05'] && BMS['Batrium06']) {
    // Strings
    var data = Buffer.alloc(8);
    data[0] = 8;
    GoodWeSend(0x452, data);

    // Alarms & Warnings
    var data = Buffer.alloc(8);
    GoodWeSend(0x455, data);

    // Targets
    var data = Buffer.alloc(8);

    data.writeUInt16LE(BMS['Batrium06']['ChargeTargetVoltage']*10,0);
    data.writeUInt16LE(BMS['Batrium06']['ChargeTargetAmp']*10,2);
    data.writeUInt16LE(BMS['Batrium06']['DischargeTargetAmp']*10,4);
    data.writeUInt16LE(BMS['Batrium06']['DischargeTargetVoltage']*10,6);
 
    GoodWeSend(0x456, data);

    // SOC & SOH
    var data = Buffer.alloc(8);
    data.writeUInt16LE(BMS['Batrium05']['SoC']*100,0);
    data.writeUInt16LE(BMS['Batrium05']['SoH']*100,2);
    GoodWeSend(0x457, data);

    // Voltage & Current
    var data = Buffer.alloc(8);
    data.writeUInt16LE(BMS['Batrium04']['ShuntVoltage']*10,0);
    data.writeInt16LE( BMS['Batrium04']['ShuntAmperes']*10,2);
    data.writeInt16LE( BMS['Batrium02']['MaxCellTemperature']*10,4);
    GoodWeSend(0x458, data);
 
    var data = Buffer.alloc(8);
    GoodWeSend(0x45a, data);

    var data = Buffer.alloc(2);
    GoodWeSend(0x460, data);
  }
}

setInterval(GoodWeIntervalFunc, 1000);
