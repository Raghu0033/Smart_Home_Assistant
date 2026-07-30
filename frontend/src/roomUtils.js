export const ROOM_TYPES = {
  Home: { label: 'Other', src: '/icons/icons/rooms_icons/Other.svg' },
  Sofa: { label: 'Living Room', src: '/icons/icons/rooms_icons/LivingRoom.svg' },
  Bed: { label: 'Bedroom', src: '/icons/icons/rooms_icons/MasterBedRoom.svg' },
  ChefHat: { label: 'Kitchen', src: '/icons/icons/rooms_icons/Kitchen.svg' },
  Bath: { label: 'Bathroom', src: '/icons/icons/rooms_icons/BathRoom.svg' },
  Building: { label: 'Hall', src: '/icons/icons/rooms_icons/Hall.svg' },
  Trees: { label: 'Balcony', src: '/icons/icons/rooms_icons/Balcony.svg' },
  Car: { label: 'Garage', src: '/icons/icons/rooms_icons/Other.svg' },
  Gamepad: { label: 'Theatre', src: '/icons/icons/rooms_icons/HomeTheatre.svg' },
  Lightbulb: { label: 'Study', src: '/icons/icons/rooms_icons/StudyRoom.svg' },
};

export const getRoomType = (room) => {
  if (ROOM_TYPES[room?.icon]) return ROOM_TYPES[room.icon];

  const name = String(room?.name || '').toLowerCase();
  if (name.includes('living') || name.includes('lounge')) return ROOM_TYPES.Sofa;
  if (name.includes('bed')) return ROOM_TYPES.Bed;
  if (name.includes('kitchen')) return ROOM_TYPES.ChefHat;
  if (name.includes('bath') || name.includes('wash')) return ROOM_TYPES.Bath;
  if (name.includes('hall') || name.includes('foyer')) return ROOM_TYPES.Building;
  if (name.includes('balcony') || name.includes('garden') || name.includes('terrace')) return ROOM_TYPES.Trees;
  if (name.includes('garage') || name.includes('parking')) return ROOM_TYPES.Car;
  if (name.includes('theatre') || name.includes('theater') || name.includes('cinema')) return ROOM_TYPES.Gamepad;
  if (name.includes('study') || name.includes('office')) return ROOM_TYPES.Lightbulb;
  return ROOM_TYPES.Home;
};
export const getRoomOptionLabel = (room) => `${room.name} · ${getRoomType(room).label}`;
export const deviceBelongsToRoom = (device, room) =>
  Boolean(device?.roomId && room?._id)
    ? String(device.roomId) === String(room._id)
    : device?.room === room?.name;
