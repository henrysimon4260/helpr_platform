import React from 'react';
import { GestureResponderEvent, Image, Pressable, ScrollView, Text, View } from 'react-native';

import { useAttachmentThumbnailsStyles } from './styles';
import { AttachmentThumbnailsProps } from './types';

export const AttachmentThumbnails: React.FC<AttachmentThumbnailsProps> = ({
  attachments,
  onRemove,
  onAdd,
  showAddLabel = true,
}) => {
  const styles = useAttachmentThumbnailsStyles();

  const handleRemove = (index: number) => (e: GestureResponderEvent) => {
    e.stopPropagation();
    onRemove(index);
  };

  const handleAdd = (e: GestureResponderEvent) => {
    e.stopPropagation();
    onAdd();
  };

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {attachments.map((att, idx) => (
          <View key={att.uri ?? idx} style={styles.thumbnailWrapper}>
            <Image source={{ uri: att.uri }} style={styles.thumbnailImage} />
            <Pressable style={styles.removeButton} onPress={handleRemove(idx)}>
              <Text style={styles.removeText}>×</Text>
            </Pressable>
          </View>
        ))}

        <Pressable style={styles.addButton} onPress={handleAdd}>
          <Text style={styles.addText}>+</Text>
        </Pressable>

        {attachments.length === 0 && showAddLabel && (
          <View style={styles.addLabelContainer}>
            <Text style={styles.addLabelText}>Add photos</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};






