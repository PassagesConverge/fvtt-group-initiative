# Lane's Group Initiative

A Foundry VTT module for enhanced group-based initiative management in the D&D 5e system.

> **This is a fork of the original [Squad Combat Initiative](https://github.com/Somedude5/Squad-Combat-Initiative) by Somedude5, with additional compatibility improvements and enhanced features.**

Group combatants into visual headers, auto-roll shared initiative, and streamline large-scale combat!

Do you love throwing hordes of enemies at your players but hate the hassle of managing their initiative?
Tired of manually averaging initiative rolls?
This module lets you group actors together under clean visual headers with minimal fuss.

## 🎯 Features

### Core Features (from original)
- **Create initiative groups** directly in the combat tracker
  - Create a group and drag actors into it
  - Or select multiple actors and click "Add Group"

![image](https://github.com/user-attachments/assets/4c5b4580-6689-42e0-9371-2acb1865e40c)

- **Roll initiative** once per group, or individually
- **Groups sort** by the highest initiative rolled among members

![image](https://github.com/user-attachments/assets/4d63fddd-ec92-4a93-a31a-ff6d44189109)

- **Drag and drop** combatants between groups
- **Customize** group headers (name, color, icon)

### ✨ Enhanced Features (in this fork)

#### Improved Module Compatibility
- **libWrapper Integration**: Proper use of libWrapper API for all method wrapping, eliminating conflicts with other modules like:
  - Monk's Combat Details
  - Combat Carousel
  - Other initiative-modifying modules
- **Graceful Fallbacks**: Works even without libWrapper installed, though it's recommended for best compatibility

#### Additional Features
- **Combat Tracker Dock Integration**: Enhanced compatibility with Combat Tracker Dock module
- **Multi-Token Effects Support**: Better handling of status effects across grouped combatants
- **Improved Error Handling**: More robust error catching and logging for easier troubleshooting

## 🧪 Compatibility

- **Foundry VTT**: v12, v13, and v14
- **Game System**: Built for D&D 5e
- **Recommended Modules**: 
  - [libWrapper](https://foundryvtt.com/packages/lib-wrapper) - For maximum compatibility with other modules

## 📦 Installation

### Method 1: Manifest URL
Use this manifest URL in Foundry's module installer:
```
[Your manifest URL here]
```

### Method 2: Manual Installation
1. Download the latest release
2. Extract to your Foundry `Data/modules` folder
3. Restart Foundry and enable the module in your world

## 🔧 Usage

1. Start or open a combat encounter
2. Select combatants in the tracker
3. Click "Add Group" to create a new group
4. Customize the group header (right-click for options)
5. Roll initiative for groups or individual combatants
6. Drag and drop to reorganize combatants

## 🐛 Troubleshooting

If you encounter issues:
- Ensure **libWrapper** is installed and active for best compatibility
- Check the browser console (F12) for error messages
- Disable other initiative-modifying modules to identify conflicts

## 🙏 Credits

**Original Module**: [Squad Combat Initiative](https://github.com/Somedude5/Squad-Combat-Initiative) by [Somedude5](https://github.com/Somedude5)

**Fork Enhancements**: imalane (compatibility improvements and additional features)

## 📄 License

MIT © 2025 Somedude5 (original), imalane (fork enhancements)

If you fork or reuse this code, please retain credit to both the original author and this fork in your project or documentation.
