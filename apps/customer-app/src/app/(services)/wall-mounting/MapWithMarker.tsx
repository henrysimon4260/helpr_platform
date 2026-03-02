import React, { forwardRef, useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, Region } from 'react-native-maps';

import { SelectedLocation } from './wall-mounting.types';

export interface MapWithMarkerProps {
  location: SelectedLocation | null;
  initialRegion?: Region;
}

const DEFAULT_REGION: Region = {
  latitude: 40.7128,
  longitude: -74.006,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

export const MapWithMarker = forwardRef<MapView, MapWithMarkerProps>(
  ({ location, initialRegion }, ref) => {
    const region = useMemo(() => initialRegion ?? DEFAULT_REGION, [initialRegion]);

    return (
      <View style={localStyles.container}>
        <MapView
          ref={ref}
          style={localStyles.map}
          provider={PROVIDER_DEFAULT}
          initialRegion={region}
          showsUserLocation={false}
          showsMyLocationButton={false}
          loadingEnabled
        >
          {location && (
            <Marker
              coordinate={location.coordinate}
              title="Location"
              description={location.description}
              anchor={{ x: 0.5, y: 1 }}
              centerOffset={{ x: 0, y: -12 }}
              tracksViewChanges={false}
            >
              <Image
                source={require('../../../assets/icons/ConfirmLocationIcon.png')}
                style={localStyles.markerIcon}
              />
            </Marker>
          )}
        </MapView>
      </View>
    );
  },
);

MapWithMarker.displayName = 'MapWithMarker';

const localStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '55%',
  },
  map: {
    flex: 1,
  },
  markerIcon: {
    width: 30,
    height: 30,
    resizeMode: 'contain',
    marginBottom: 10,
  },
});
