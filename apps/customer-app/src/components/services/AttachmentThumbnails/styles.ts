import { useTheme } from '@theme';
import { StyleSheet } from 'react-native';

export const useAttachmentThumbnailsStyles = () => {
  const theme = useTheme();

  return StyleSheet.create({
    container: {
      marginTop: 'auto',
      marginBottom: 16,
      height: 50,
      alignItems: 'flex-start',
      paddingLeft: 16,
      paddingRight: 8,
      paddingBottom: 0,
    },
    scroll: {
      alignItems: 'center',
    },
    thumbnailWrapper: {
      width: 56,
      height: 42,
      marginRight: 8,
      position: 'relative',
    },
    thumbnailImage: {
      width: 56,
      height: 42,
      borderRadius: 6,
      resizeMode: 'cover',
    },
    removeButton: {
      position: 'absolute',
      top: -6,
      right: -6,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: '#b02a2a',
      alignItems: 'center',
      justifyContent: 'center',
    },
    removeText: {
      color: '#fff',
      fontSize: 16,
      lineHeight: 18,
      fontWeight: '600',
    },
    addButton: {
      width: 42,
      height: 42,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: theme.colors.primary,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    addText: {
      fontSize: 24,
      color: theme.colors.primary,
      fontWeight: '600',
      lineHeight: 26,
    },
    addLabelContainer: {
      marginLeft: 10,
      justifyContent: 'center',
    },
    addLabelText: {
      fontSize: 13,
      fontWeight: '500',
      color: theme.colors.primary,
    },
  });
};






