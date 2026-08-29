// Shared paper-theme constants -- per-habit colors ported 1:1 from the
// design reference's `habits` array (visuals.jsx), matched onto our real
// habit keys, plus display labels. Used by every paper-themed page (Live,
// and now Calibrate/Dashboard/Settings/About) so the same habit always
// reads as the same color everywhere.
export const STATUS_COLOR = {
  none: '#75aaa0',
  nail_biting: '#d68765',
  hair_pulling: '#9c8bd4',
  face_touching: '#71a9a1',
  lip_biting: '#d07c89',
  nose_picking: '#d1a35c',
  eye_rubbing: '#6f9db7',
  skin_picking: '#c77f62',
  chewing: '#7caa78',
  chin_resting: '#9c9981',
  posture_slouching: '#8b9dc3',
  teeth_grinding: '#c4a45c',
  knuckle_cracking: '#b58a6b',
}

// AuraOrb only ever shows `none` or one of the 9 classifier habits (posture/
// audio never become `currentLabel`), so its palette is the STATUS_COLOR
// subset that applies, plus the idle "watching" state for session-not-running.
export const ORB_PALETTE = {
  none: STATUS_COLOR.none,
  nail_biting: STATUS_COLOR.nail_biting,
  hair_pulling: STATUS_COLOR.hair_pulling,
  face_touching: STATUS_COLOR.face_touching,
  lip_biting: STATUS_COLOR.lip_biting,
  nose_picking: STATUS_COLOR.nose_picking,
  eye_rubbing: STATUS_COLOR.eye_rubbing,
  skin_picking: STATUS_COLOR.skin_picking,
  chewing: STATUS_COLOR.chewing,
  chin_resting: STATUS_COLOR.chin_resting,
  watching: STATUS_COLOR.none,
}

export const LABELS = {
  none: 'All clear',
  nail_biting: 'Nail biting',
  hair_pulling: 'Hair pulling',
  face_touching: 'Face touching',
  lip_biting: 'Lip biting',
  nose_picking: 'Nose picking',
  eye_rubbing: 'Eye rubbing',
  skin_picking: 'Skin picking',
  chewing: 'Chewing on objects',
  chin_resting: 'Chin/cheek resting',
  posture_slouching: 'Posture drift',
  teeth_grinding: 'Teeth grinding',
  knuckle_cracking: 'Knuckle cracking',
}
