/* eslint-disable */
export interface Destination {
  id: string;
  routeName: string;
  conditions?: {
    ships?: string;
    speed?: string;
  };
  path: string[];
  radius?: number;
}

export interface MapRouteConfig {
  mapId: number;
  destinations: Destination[];
}

/**
 * Parses YAML Front Matter from Markdown text
 */
export function parseFrontMatter(markdown: string): { config: MapRouteConfig | null; content: string } {
  const lines = markdown.split(/\r?\n/);
  if (lines.length === 0 || lines[0] !== '---') {
    return { config: null, content: markdown };
  }

  let endIdx = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === '---') {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) {
    return { config: null, content: markdown };
  }

  const yamlLines = lines.slice(1, endIdx);
  const content = lines.slice(endIdx + 1).join('\n');

  let mapId = 0;
  const destinations: Destination[] = [];
  let currentDest: Partial<Destination> | null = null;
  let inConditions = false;

  for (const line of yamlLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('mapId:')) {
      mapId = parseInt(trimmed.replace('mapId:', '').trim(), 10);
      continue;
    }

    if (trimmed.startsWith('destinations:')) {
      currentDest = null;
      inConditions = false;
      continue;
    }

    if (trimmed.startsWith('- id:')) {
      if (currentDest && currentDest.id) {
        destinations.push(currentDest as Destination);
      }
      const idVal = trimmed.replace('- id:', '').replace(/"/g, '').replace(/'/g, '').trim();
      currentDest = { id: idVal, path: [] };
      inConditions = false;
      continue;
    }

    if (currentDest) {
      if (trimmed.startsWith('routeName:')) {
        currentDest.routeName = trimmed.replace('routeName:', '').replace(/"/g, '').replace(/'/g, '').trim();
      } else if (trimmed.startsWith('conditions:')) {
        currentDest.conditions = {};
        inConditions = true;
      } else if (inConditions && trimmed.startsWith('ships:')) {
        currentDest.conditions = currentDest.conditions || {};
        currentDest.conditions.ships = trimmed.replace('ships:', '').replace(/"/g, '').replace(/'/g, '').trim();
      } else if (inConditions && trimmed.startsWith('speed:')) {
        currentDest.conditions = currentDest.conditions || {};
        currentDest.conditions.speed = trimmed.replace('speed:', '').replace(/"/g, '').replace(/'/g, '').trim();
      } else if (trimmed.startsWith('path:')) {
        const pathStr = trimmed.replace('path:', '').trim();
        const pathMatch = pathStr.match(/\[(.*?)\]/);
        if (pathMatch) {
          currentDest.path = pathMatch[1]
            .split(',')
            .map((s) => s.replace(/"/g, '').replace(/'/g, '').trim())
            .filter(Boolean);
        }
        inConditions = false;
      } else if (trimmed.startsWith('radius:')) {
        currentDest.radius = parseInt(trimmed.replace('radius:', '').trim(), 10);
      }
    }
  }

  if (currentDest && currentDest.id) {
    destinations.push(currentDest as Destination);
  }

  return {
    config: { mapId, destinations },
    content,
  };
}

/**
 * Matches a request string against the parsed routing config to find the best route destination
 */
export function matchDestination(config: MapRouteConfig, request: string): Destination | null {
  if (!config.destinations || config.destinations.length === 0) return null;

  // 1. Check for specific node pattern match
  for (const dest of config.destinations) {
    const rx = new RegExp(`\\b${dest.id}\\s*(マス|node)?\\b`, 'i');
    if (rx.test(request)) {
      return dest;
    }
  }

  // 2. Check for gauge numbers/names
  if (request.includes('第一') || request.includes('1ゲージ') || request.includes('第1') || request.includes('1st')) {
    const found = config.destinations.find((d) => d.routeName.includes('第一') || d.routeName.includes('1'));
    if (found) return found;
  }
  if (request.includes('第二') || request.includes('2ゲージ') || request.includes('第2') || request.includes('2nd')) {
    const found = config.destinations.find((d) => d.routeName.includes('第二') || d.routeName.includes('2'));
    if (found) return found;
  }
  if (request.includes('第三') || request.includes('3ゲージ') || request.includes('第3') || request.includes('3rd')) {
    const found = config.destinations.find((d) => d.routeName.includes('第三') || d.routeName.includes('3'));
    if (found) return found;
  }

  // Default to the last destination (usually the final boss node)
  return config.destinations[config.destinations.length - 1];
}

/**
 * Checks fleet conditions against the matched route destination to output branching warnings.
 */
export function checkBranchConditions(dest: Destination, fleetInfo: any): string[] {
  const warnings: string[] = [];
  if (!dest.conditions || !fleetInfo || !fleetInfo.fleets || fleetInfo.fleets.length === 0) {
    return warnings;
  }
  const firstFleet = fleetInfo.fleets[0];
  const ships = (firstFleet.ships || []).filter((s: any) => s && s.data && s.data.id > 0);
  if (ships.length === 0) return warnings;

  // 1. Speed check
  const speedCond = dest.conditions.speed;
  if (speedCond) {
    const speeds = ships.map((s: any) => s.speed || s.data?.speed || 0);
    if (speedCond.includes('高速+')) {
      const hasNotFastPlus = speeds.some((sp: number) => sp < 15);
      if (hasNotFastPlus) {
        warnings.push('艦隊速力が「高速+」統一されていません（低速・高速の艦が含まれています）。');
      }
    } else if (speedCond.includes('高速')) {
      const hasSlow = speeds.some((sp: number) => sp < 10);
      if (hasSlow) {
        warnings.push('艦隊速力が「高速」統一されていません（低速の艦が含まれています）。');
      }
    }
  }

  // 2. Ships count check
  const shipsCond = dest.conditions.ships;
  if (shipsCond) {
    let ddCount = 0;
    let clCount = 0;
    let cltCount = 0;
    let caCount = 0;
    let cavCount = 0;
    let bbCount = 0;
    let cvCount = 0;
    let ssCount = 0;
    let avCount = 0;
    let deCount = 0;

    for (const s of ships) {
      const type = s.data?.type;
      if (type === 1) deCount++;
      else if (type === 2) ddCount++;
      else if ([3, 21].includes(type)) clCount++;
      else if (type === 4) cltCount++;
      else if (type === 5) caCount++;
      else if (type === 6) cavCount++;
      else if ([8, 9, 10, 12].includes(type)) bbCount++;
      else if ([7, 11, 18].includes(type)) cvCount++;
      else if ([13, 14].includes(type)) ssCount++;
      else if (type === 16) avCount++;
    }

    const matchRule = (name: string, count: number) => {
      const rx = new RegExp(`${name}\\s*(\\d+)(隻)?(以上|以下|等)?`);
      const m = shipsCond.match(rx);
      if (m) {
        const reqVal = parseInt(m[1], 10);
        const op = m[3] || '';
        if (op === '以上') {
          if (count < reqVal) warnings.push(`${name}が不足しています（必要:${reqVal}以上, 現在:${count}）。`);
        } else if (op === '以下') {
          if (count > reqVal) warnings.push(`${name}が多すぎます（上限:${reqVal}以下, 現在:${count}）。`);
        } else {
          if (count !== reqVal) warnings.push(`${name}の隻数が一致しません（必要:${reqVal}, 現在:${count}）。`);
        }
      }
    };

    matchRule('駆逐', ddCount);
    matchRule('軽巡', clCount);
    matchRule('雷巡', cltCount);
    matchRule('重巡', caCount);
    matchRule('航巡', cavCount);
    matchRule('戦艦', bbCount);
    matchRule('航戦', bbCount);
    matchRule('空母', cvCount);
    matchRule('軽空母', cvCount);
    matchRule('潜水', ssCount);
    matchRule('水母', avCount);
    matchRule('海防', deCount);
  }

  // 3. 特殊海域ルート検証 (例: 5-5 BKPSルート)
  if (dest.id === '5-5' || dest.routeName.includes('5-5') || dest.routeName.includes('BKPS')) {
    let bbCount = 0;
    let cvCount = 0;
    let aoCount = 0;
    for (const s of ships) {
      const type = s.data?.type;
      if ([8, 9, 10, 12].includes(type)) bbCount++;
      if ([7, 11, 18].includes(type)) cvCount++;
      if ([15, 22].includes(type)) aoCount++;
    }
    if (cvCount > 2) warnings.push('5-5 BKPSルート違反: 空母が3隻以上含まれています（最大2隻まで）。');
    if (bbCount > 2) warnings.push('5-5 BKPSルート違反: 戦艦/航戦が3隻以上含まれています（最大2隻まで）。');
    if (aoCount > 0) warnings.push('5-5 BKPSルート違反: 補給艦が含まれています。');
  }

  return warnings;
}

