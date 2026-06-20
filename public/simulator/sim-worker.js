// Web Worker for KanColle Sortie Simulator
var window = self;

// Load simulation engines
importScripts(
  './kcSHIPDATA.js',
  './kcEQDATA.js',
  './shared.js',
  './kcships.js',
  './kcsim.js',
  './kcsimcombined.js'
);

// Mock UI/DOM-related functions so the simulator runs without errors
var updateResults = function(totalResult) {
  self.postMessage({ type: 'results', data: totalResult });
};

var DORETREAT = true;

function simDataAddError(text) {
  console.error("Simulator Error: " + text);
  self.postMessage({ type: 'error', data: text });
}

function simDataAddWarn(text) {
  console.warn("Simulator Warning: " + text);
  self.postMessage({ type: 'warning', data: text });
}

// Data loaders adapted from kancolle-replay ui.js
function simDataLoad(data) {
  let optionsAll = [];
  
  FLEETS1[0] = simDataLoadFleet(data.fleetF, 0);
  if (FLEETS1[0] && FLEETS1[0].combinedWith) {
    FLEETS1[1] = FLEETS1[0].combinedWith;
    FLEETS1.length = 2;
  } else {
    FLEETS1.length = 1;
  }
  
  if (data.fleetSupportN) FLEETS1S[0] = simDataLoadFleet(data.fleetSupportN, 0);
  else FLEETS1S[0] = null;
  if (data.fleetSupportB) FLEETS1S[1] = simDataLoadFleet(data.fleetSupportB, 0);
  else FLEETS1S[1] = null;
  
  if (data.lbas) {
    LBAS = [];
    for (let i = 0; i < 3; i++) {
      if (!data.lbas[i]) {
        LBAS[i] = null;
        continue;
      }
      let eqids = [], improves = [], profs = [];
      for (let equip of data.lbas[i].equips) {
        if (!EQDATA[equip.masterId]) {
          if (equip.stats && equip.stats.type) {
            EQDATA[equip.masterId] = {};
            for (let stat in equip.stats) EQDATA[equip.masterId][stat] = equip.stats[stat];
          } else {
            simDataAddError('Unknown equip: ' + equip.masterId + ', stats required');
            continue;
          }
        }
        eqids.push(equip.masterId);
        improves.push(equip.improve || 0);
        profs.push(equip.proficiency || 0);
      }
      LBAS[i] = new LandBase(eqids, improves, profs);
      if (data.lbas[i].slots) {
        LBAS[i].PLANESLOTS = data.lbas[i].slots;
        LBAS[i].planecount = LBAS[i].PLANESLOTS.slice();
      }
    }
  } else {
    LBAS = [null, null, null];
  }
  
  FLEETS2 = [];
  for (let i = 0; i < data.nodes.length; i++) {
    let node = data.nodes[i];
    let options = {};
    options.NB = node.doNB;
    options.NBonly = node.NBOnly;
    options.aironly = node.airOnly;
    options.landbomb = node.airRaid;
    options.noammo = node.noAmmo;
    options.formation = node.formationOverride || '0';
    options.lbas = node.lbas || [];
    optionsAll.push(options);
    
    FLEETS2[i] = simDataLoadFleet(node.fleetE, 1);
  }
  
  if (data.mechanics) {
    for (let mechanic in data.mechanics) {
      MECHANICS[mechanic] = data.mechanics[mechanic];
    }
  }
  if (data.bucketHPPercent != null) BUCKETPERCENT = data.bucketHPPercent;
  if (data.bucketTime != null) BUCKETTIME = data.bucketTime;
  if (data.continueOnTaiha) DORETREAT = false;
  
  return optionsAll;
}

function simDataLoadFleet(dataFleet, side) {
  let fleetMain = new Fleet(side);
  let ships = simDataLoadShips(dataFleet.ships, side);
  if (ships.length) fleetMain.loadShips(ships);
  else return null;
  
  let combineType = dataFleet.combineType || 1;
  let formNum = dataFleet.formation.toString();
  if (formNum.length == 2) {
    formNum = combineType + formNum;
  }
  if (!ALLFORMATIONS[formNum]) {
    simDataAddError('Invalid formation (combined): ' + dataFleet.formation);
    return fleetMain;
  }
  if (dataFleet.shipsC) {
    let fleetEscort = new Fleet(side, fleetMain);
    let shipsC = simDataLoadShips(dataFleet.shipsC, side);
    if (shipsC.length) fleetEscort.loadShips(shipsC);
    else return null;
    
    fleetMain.formation = ALLFORMATIONS[formNum];
    fleetEscort.formation = ALLFORMATIONS[formNum + 'E'];
  } else {
    fleetMain.formation = ALLFORMATIONS[formNum];
  }
  return fleetMain;
}

function simDataLoadShips(dataShips, side) {
  let typeMap = { 1:'DE',2:'DD',3:'CL',4:'CLT',5:'CA',6:'CAV',7:'CVL',8:'FBB',9:'BB',10:'BBV',11:'CV',13:'SS',14:'SSV',15:'AT',16:'AV',17:'LHA',18:'CVB',19:'AR',20:'AS',21:'CT',22:'AO' };

  let simShips = [];
  for (let ship of dataShips) {
    let level = ship.LVL || 99;
    if (!isPlayable(ship.masterId)) level = 1;
    let ShipType = null, overrideType = '';
    let stats = { HP: 0, FP: 0, TP: 0, AA: 0, AR: 0, LUK: 0, EV: 0, ASW: 0, LOS: 0, RNG: 0, SPD: 0, SLOTS: [] };
    let sdata = SHIPDATA[ship.masterId];
    if (sdata) {
      if (!ship.LVL && level == 1 && (sdata.type == 'SS' || sdata.type == 'SSV')) level = 50;
      stats.HP = getHP(sdata, level);
      stats.FP = sdata.FP;
      stats.TP = sdata.TP;
      stats.AA = sdata.AA;
      stats.AR = sdata.AR;
      stats.LUK = sdata.LUK;
      stats.EV = (sdata.EVbase != null)? sdata.EVbase + Math.floor((sdata.EV - sdata.EVbase)*level/99) : sdata.EV;
      stats.ASW = (sdata.ASWbase != null)? sdata.ASWbase + Math.floor((sdata.ASW - sdata.ASWbase)*level/99) : sdata.ASW;
      stats.LOS = (sdata.LOSbase != null)? sdata.LOSbase + Math.floor((sdata.LOS - sdata.LOSbase)*level/99) : sdata.LOS;
      stats.RNG = sdata.RNG;
      stats.SPD = sdata.SPD;
      stats.SLOTS = sdata.SLOTS;
      ShipType = window[sdata.type];
    }
    if (ship.stats) {
      for (let stat in stats) {
        if (ship.stats[stat] != null) stats[stat] = ship.stats[stat];
      }
      if (ship.stats.type) {
        overrideType = (typeof ship.stats.type === 'number')? typeMap[ship.stats.type] : ship.stats.type;
        if (window[overrideType]) {
          ShipType = window[overrideType];
        } else {
          simDataAddError('Invalid ship type: ' + ship.stats.type);
          continue;
        }
      }
      if (!SHIPDATA[ship.masterId]) {
        SHIPDATA[ship.masterId] = {};
        for (let stat in stats) SHIPDATA[ship.masterId][stat] = stats[stat];
        for (let stat in ship.stats) SHIPDATA[ship.masterId][stat] = ship.stats[stat];
      }
    }
    if (!ShipType || !stats.HP || !SHIPDATA[ship.masterId]) {
      simDataAddError('Unknown ship: ' + ship.masterId + ', stats required');
      continue;
    }
    let simShip = new ShipType(ship.masterId, '', side, level, stats.HP, stats.FP, stats.TP, stats.AA, stats.AR, stats.EV, stats.ASW, stats.LOS, stats.LUK, stats.RNG, stats.SLOTS);
    if (ship.HPInit != null) simShip.HP = simShip.HPDefault = ship.HPInit;
    if (ship.fuelInit != null) simShip.fuelleft = simShip.fuelDefault = 10*ship.fuelInit;
    if (ship.ammoInit != null) simShip.ammoleft = simShip.ammoDefault = 10*ship.ammoInit;
    if (ship.morale != null) simShip.morale = simShip.moraleDefault = ship.morale;
    if (ship.stats && ship.stats.TACC) simShip.TACC = ship.stats.TACC;
    if (overrideType) simShip.type = overrideType;
    simShip.protection = (side === 0);
    
    if (ship.equips) {
      let equips = [], improves = [], profs = [];
      for (let equip of ship.equips) {
        if (!EQDATA[equip.masterId]) {
          if (equip.stats && equip.stats.type) {
            EQDATA[equip.masterId] = {};
            for (let stat in equip.stats) EQDATA[equip.masterId][stat] = equip.stats[stat];
          } else {
            simDataAddError('Unknown equip: ' + equip.masterId + ', stats required');
            continue;
          }
        }
        equips.push(equip.masterId);
        improves.push(equip.improve || 0);
        profs.push(equip.proficiency || 0);
      }
      if (equips.length) {
        simShip.loadEquips(equips, improves, profs, !ship.includesEquipStats);
      }
    } else if (sdata && sdata.EQUIPS) {
      simShip.loadEquips(sdata.EQUIPS, [], [], true);
    }
    
    simShips.push(simShip);
  }
  return simShips;
}

// Worker message handler
self.onmessage = function(e) {
  let { type, data } = e.data;
  if (type === 'simulate') {
    let numsims = data.numSims || 1000;
    try {
      let optionsAll = simDataLoad(data);
      let combineType = data.fleetF.combineType;
      
      if (combineType) {
        simStatsCombined(numsims, combineType, optionsAll);
      } else {
        simStats(numsims, optionsAll);
      }
    } catch(err) {
      simDataAddError(err.message + '\n' + err.stack);
    }
  }
};
