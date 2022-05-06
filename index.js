var util=require('util');
var can = require('socketcan');
var buffer = require('buffer');
var Parser = require('binary-parser').Parser;
const commandLineArgs = require('command-line-args')

const optionDefinitions = [
	{ name: 'batriumv2', alias: 'b', type: Boolean,  defaultValue: false},
	{ name: 'invif', alias: 'c', type: String, defaultValue: "can0" },
	{ name: 'bmsif', alias: 'C', type: String, defaultValue: "can1" },
	{ name: 'debug', alias: 'd', type: Boolean, defaultValue: false },
	{ name: 'verbose', alias: 'v', type: Boolean, defaultValue: false },
  ];

const options = commandLineArgs(optionDefinitions)

var invif = options.invif;
var bmsif = options.bmsif;

console.log("Inverter interface: " + invif);
console.log("BMS interface     : " + bmsif);

var channelGoodWe  = can.createRawChannel(invif, true /* ask for timestamps */);
var channelBatrium = can.createRawChannel(bmsif, true /* ask for timestamps */);

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

const GoodWe421Parser = new Parser()
        .uint8('Year')
        .uint8('Month')
        .uint8('Day')
        .uint8('Hour')
        .uint8('Min')
        .uint8('Sec')
        .seek(2)
        ;

const GoodWe425Parser = new Parser()
        .uint16le('BatteryVoltage', { formatter: (x) => {return x/10.0;}})
        .int16le('BatteryCurrent', { formatter: (x) => {return x/10.0;}})
        ;

const GoodWe453Parser = new Parser()
        .uint8('BatteryModules')
        ;

const GoodWe455Parser = new Parser()
        .uint16le('BMSAlarms')
        .seek(2)
        .uint16le('BMSWarnings')
        .seek(2)
        ;

const GoodWe456Parser = new Parser()
        .uint16le('ChargeVoltage', { formatter: (x) => {return x/10.0;}})
        .uint16le('ChargeCurrent', { formatter: (x) => {return x/10.0;}})
        .uint16le('DischargeCurrent', { formatter: (x) => {return x/10.0;}})
        .uint16le('DischargeVoltage', { formatter: (x) => {return x/10.0;}})
        ;

const GoodWe457Parser = new Parser()
        .uint16le('SOC', { formatter: (x) => {return x/100.0;}})
        .uint16le('SOH', { formatter: (x) => {return x/100.0;}})
        .seek(4)
        ;

const GoodWe458Parser = new Parser()
        .uint16le('BatteryVoltage', { formatter: (x) => {return x/10.0;}})
        .uint16le('BatteryCurrent', { formatter: (x) => {return x/10.0;}})
        .uint16le('BatteryTemperature', { formatter: (x) => {return x/10.0;}})
        .seek(2)
        ;

const GoodWe45aParser = new Parser()
        .seek(8)
        ;

const GoodWe460Parser = new Parser()
        .seek(2)
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
        if(options.verbose) {
          console.log(util.inspect(BMS));
        }
}

function GoodWeGetPayload(msg) {
        if(msg.id==0x420) {
          GoodWe["GoodWe420"] = GoodWe420Parser.parse(msg.data);
        }
        if(msg.id==0x421) {
          GoodWe["GoodWe421"] = GoodWe421Parser.parse(msg.data);
        }
        if(msg.id==0x425) {
          GoodWe["GoodWe425"] = GoodWe425Parser.parse(msg.data);
        }
        if(msg.id==0x453) {
          GoodWe["GoodWe453"] = GoodWe453Parser.parse(msg.data);
        }
        if(msg.id==0x455) {
          GoodWe["GoodWe455"] = GoodWe455Parser.parse(msg.data);
        }
        if(msg.id==0x456) {
          GoodWe["GoodWe456"] = GoodWe456Parser.parse(msg.data);
        }
        if(msg.id==0x457) {
          GoodWe["GoodWe457"] = GoodWe457Parser.parse(msg.data);
        }
        if(msg.id==0x458) {
          GoodWe["GoodWe458"] = GoodWe458Parser.parse(msg.data);
        }
        if(msg.id==0x45a) {
          GoodWe["GoodWe45a"] = GoodWe45aParser.parse(msg.data);
        }
        if(msg.id==0x460) {
          GoodWe["GoodWe460"] = GoodWe460Parser.parse(msg.data);
        }
        if(options.verbose) {
          console.log(util.inspect(GoodWe));
        }
}

function toHex(number) {
  return ("00000000" + number.toString(16)).slice(-8);
}

function BatriumPacket(msg) {

  if(options.debug) {
    console.log('Batrium: (' + (msg.ts_sec + msg.ts_usec / 1000000).toFixed(6) + ') ' +
      toHex(msg.id).toUpperCase() + '#' + msg.data.toString('hex').toUpperCase());
  }

  BatriumGetPayload(msg);
}

function GoodWePacket(msg) {

  if(options.debug) {
    console.log('GoodWe: (' + (msg.ts_sec + msg.ts_usec / 1000000).toFixed(6) + ') ' +
      toHex(msg.id).toUpperCase() + '#' + msg.data.toString('hex').toUpperCase());
  }
  GoodWeGetPayload(msg);
}

channelGoodWe.addListener("onMessage", GoodWePacket);

if(options.batriumv2) {
  console.log("using batrium v2 protocol on " + bmsif);
  channelBatrium.addListener("onMessage", BatriumPacket);
} else {
  console.log("using GoodWe native protocol on " + bmsif);
  channelBatrium.addListener("onMessage", GoodWePacket);
}

function GoodWeSend(id, data) {
  var msg = {
    id: id,
    length: data.length,
    data: data
  };
  if(options.debug) {
    console.log("->GoodWe: " + util.inspect(msg));
  }
  channelGoodWe.send(msg);
}
function BatriumSend(id, data) {
  var msg = {
    id: id,
    length: data.length,
    data: data
  };
  if(options.debug) {
    console.log("->Batrium: " + util.inspect(msg));
  }
  channelBatrium.send(msg);
}

function GoodWeIntervalFunc() {
  
  if(BMS['Batrium02'] && BMS['Batrium04'] && BMS['Batrium05'] && BMS['Batrium06']) {
    // Strings
    var data = Buffer.alloc(8);
    data[0] = 8;
    GoodWeSend(0x453, data);

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
  if(GoodWe['GoodWe453'] && GoodWe['GoodWe455'] && GoodWe['GoodWe456'] && GoodWe['GoodWe457'] && GoodWe['GoodWe458']) {
  // Strings
    var data = Buffer.alloc(8);

    data.writeUInt8(GoodWe['GoodWe453']['BatteryModules'],0);
    GoodWeSend(0x453, data);

    // Alarms & Warnings
    var data = Buffer.alloc(8);

    data.writeUInt16LE(GoodWe['GoodWe455']['BMSAlarms'],0);
    data.writeUInt16LE(GoodWe['GoodWe455']['BMSWarnings'],4);
    GoodWeSend(0x455, data);

    // Targets
    var data = Buffer.alloc(8);

    data.writeUInt16LE(GoodWe['GoodWe456']['ChargeVoltage']*10,0);
    data.writeUInt16LE(GoodWe['GoodWe456']['ChargeCurrent']*10,2);
    data.writeUInt16LE(GoodWe['GoodWe456']['DischargeCurrent']*10,4);
    data.writeUInt16LE(GoodWe['GoodWe456']['DischargeVoltage']*10,6);

    GoodWeSend(0x456, data);

    // SOC & SOH
    var data = Buffer.alloc(8);
    data.writeUInt16LE(GoodWe['GoodWe457']['SOC']*100,0);
    data.writeUInt16LE(GoodWe['GoodWe457']['SOH']*100,2);
    GoodWeSend(0x457, data);

    // Voltage & Current
    var data = Buffer.alloc(8);
    data.writeUInt16LE(GoodWe['GoodWe458']['BatteryVoltage']*10,0);
    data.writeInt16LE( GoodWe['GoodWe458']['BatteryCurrent']*10,2);
    data.writeInt16LE( GoodWe['GoodWe458']['BatteryTemperature']*10,4);
    GoodWeSend(0x458, data);

    var data = Buffer.alloc(8);
    GoodWeSend(0x45a, data);

    var data = Buffer.alloc(2);
    GoodWeSend(0x460, data);
  }

  if(GoodWe['GoodWe420']) {
  // Signature
    var data = Buffer.alloc(8);

    data.write(GoodWe['GoodWe420']['Signature'],0);
//    BatriumSend(0x420, data);
  }
  if(GoodWe['GoodWe421']) {
  // Date & Time
    var data = Buffer.alloc(8);

    data.writeUInt8(GoodWe['GoodWe421']['Year'],0);
    data.writeUInt8(GoodWe['GoodWe421']['Month'],1);
    data.writeUInt8(GoodWe['GoodWe421']['Day'],2);
    data.writeUInt8(GoodWe['GoodWe421']['Hour'],3);
    data.writeUInt8(GoodWe['GoodWe421']['Min'],4);
    data.writeUInt8(GoodWe['GoodWe421']['Sec'],5);
//    BatriumSend(0x421, data);
  }
  if(GoodWe['GoodWe425']) {
  // Battery Voltage & Current
    var data = Buffer.alloc(8);

    data.writeUInt16LE(GoodWe['GoodWe425']['BatteryVoltage']*10,0);
    data.writeInt16LE(GoodWe['GoodWe425']['BatteryCurrent']*10,2);
    BatriumSend(0x425, data);
  }
}

setInterval(GoodWeIntervalFunc, 1000);

