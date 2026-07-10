import { callService, cachedHaStates } from '../../integrations/homeassistant/ha-client.js';

const previousVolumes = new Map(); // entity_id -> volume level (0.0 to 1.0)
const crossfadeIntervals = new Map();
const autoPausedSpeakers = new Set(); // Stores entity_ids of speakers we automatically paused

/**
 * Helper to find the media player for a given room name.
 */
function getMediaPlayersForRoom(roomName) {
  const players = [];
  if (!roomName) return players;
  const targetRoom = roomName.toLowerCase();
  
  for (const [entityId, entity] of cachedHaStates.entries()) {
    if (entity.type === 'media_player' && entity.room && entity.room.toLowerCase() === targetRoom) {
      if (!entityId.includes('group')) {
        players.push(entity);
      }
    }
  }
  return players;
}

/**
 * Helper to find an actively playing media player outside of the target room.
 */
function getActiveSourcePlayer(excludeRoomName) {
  const excludeRoom = excludeRoomName.toLowerCase();
  for (const [entityId, entity] of cachedHaStates.entries()) {
    if (
      entity.type === 'media_player' &&
      entity.state === 'playing' &&
      (!entity.room || entity.room.toLowerCase() !== excludeRoom) &&
      !entityId.includes('group')
    ) {
      return entity;
    }
  }
  return null;
}

export function handlePresenceChange(roomName, isPresent) {
  if (!roomName || roomName === 'Unassigned') return;
  
  const players = getMediaPlayersForRoom(roomName);
  if (!players || players.length === 0) return;

  let activeSource = null;
  let pausedSourceId = null;

  if (isPresent) {
    activeSource = getActiveSourcePlayer(roomName);
    
    // If no active source is found, but we previously auto-paused speakers, 
    // we can use one of those as the source to resume the queue!
    if (!activeSource && autoPausedSpeakers.size > 0) {
      pausedSourceId = Array.from(autoPausedSpeakers)[0];
      console.log(`[FollowMeAudio] No active source, but found auto-paused source: ${pausedSourceId}`);
    } else if (activeSource) {
      console.log(`[FollowMeAudio] Found active source ${activeSource.entity_id}`);
      // Clear auto-paused speakers since we found an actively playing one anyway
      autoPausedSpeakers.clear(); 
    }
  }

  for (const player of players) {
    const entityId = player.entity_id;
    const currentVolume = player.volume !== undefined ? player.volume / 100 : 0;

    console.log(`[FollowMeAudio] Presence in ${roomName} is ${isPresent ? 'ON' : 'OFF'}. Speaker: ${entityId}, CurVol: ${currentVolume}`);

    if (isPresent) {
      let targetVol = previousVolumes.get(entityId) || 0.3;

      if (activeSource) {
        // Join to existing active group
        console.log(`[FollowMeAudio] Joining ${entityId} to source ${activeSource.entity_id}`);
        callService('media_player', 'join', {
          entity_id: activeSource.entity_id,
          group_members: [entityId]
        });
        if (activeSource.attributes && activeSource.attributes.volume_level) {
          targetVol = activeSource.attributes.volume_level;
        }
      } else if (pausedSourceId) {
        // Join to the paused source and resume it!
        console.log(`[FollowMeAudio] Joining ${entityId} to paused source ${pausedSourceId} and resuming`);
        callService('media_player', 'join', {
          entity_id: pausedSourceId,
          group_members: [entityId]
        });
        callService('media_player', 'media_play', { entity_id: pausedSourceId });
        
        const pausedPlayer = cachedHaStates.get(pausedSourceId);
        if (pausedPlayer && pausedPlayer.attributes && pausedPlayer.attributes.volume_level) {
          targetVol = pausedPlayer.attributes.volume_level;
        }
        
        // We only resume one source, then clear the set
        autoPausedSpeakers.clear();
      }

      if (targetVol < 0.1) targetVol = 0.3; 

      if (currentVolume >= targetVol && currentVolume > 0.05) {
        console.log(`[FollowMeAudio] ${entityId} is already at or above target volume.`);
        continue;
      }

      fadeVolume(entityId, currentVolume, targetVol, 4000, false, false);
      
      // If we are resuming the SAME speaker that was auto-paused
      if (autoPausedSpeakers.has(entityId)) {
          callService('media_player', 'media_play', { entity_id: entityId });
          autoPausedSpeakers.delete(entityId);
      }

    } else {
      // Presence OFF -> Fade down to 0, then unjoin and auto-pause
      if (currentVolume > 0.05) {
        previousVolumes.set(entityId, currentVolume); 
      }
      
      // Only pause if it was actually playing
      const isPlaying = player.state === 'playing';
      fadeVolume(entityId, currentVolume, 0, 4000, true, isPlaying);
    }
  }
}

/**
 * Smoothly crossfade volume for an HA media player over a duration.
 */
function fadeVolume(entityId, startVol, endVol, durationMs, unjoinOnComplete = false, pauseOnComplete = false) {
  if (crossfadeIntervals.has(entityId)) {
    clearInterval(crossfadeIntervals.get(entityId));
  }

  if (Math.abs(startVol - endVol) < 0.02) {
    executeCompletionActions(entityId, endVol, unjoinOnComplete, pauseOnComplete);
    return;
  }

  const steps = 10;
  const stepTime = Math.floor(durationMs / steps);
  const volumeDiff = endVol - startVol;
  const stepVol = volumeDiff / steps;
  let currentStep = 0;

  const interval = setInterval(async () => {
    currentStep++;
    let nextVol = startVol + (stepVol * currentStep);
    
    if (nextVol < 0) nextVol = 0;
    if (nextVol > 1) nextVol = 1;

    try {
      await callService('media_player', 'volume_set', {
        entity_id: entityId,
        volume_level: Number(nextVol.toFixed(2))
      });
    } catch (e) {
      console.error(`[FollowMeAudio] Failed to set volume for ${entityId}:`, e.message);
    }

    if (currentStep >= steps) {
      clearInterval(interval);
      crossfadeIntervals.delete(entityId);
      executeCompletionActions(entityId, nextVol, unjoinOnComplete, pauseOnComplete);
    }
  }, stepTime);

  crossfadeIntervals.set(entityId, interval);
}

function executeCompletionActions(entityId, finalVol, unjoinOnComplete, pauseOnComplete) {
  try {
    callService('media_player', 'volume_set', {
      entity_id: entityId,
      volume_level: Number(finalVol.toFixed(2))
    });

    if (unjoinOnComplete && finalVol < 0.02) {
      console.log(`[FollowMeAudio] Faded down, unjoining ${entityId}`);
      callService('media_player', 'unjoin', { entity_id: entityId });
    }

    if (pauseOnComplete && finalVol < 0.02) {
      console.log(`[FollowMeAudio] Faded down, auto-pausing ${entityId}`);
      callService('media_player', 'media_pause', { entity_id: entityId });
      autoPausedSpeakers.add(entityId);
    }
  } catch (e) {
    console.error(`[FollowMeAudio] Completion action error:`, e.message);
  }
}
