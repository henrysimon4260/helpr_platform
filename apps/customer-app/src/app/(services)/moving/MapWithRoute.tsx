import React, { forwardRef, useMemo } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import MapView, { LatLng, Marker, Polyline, PROVIDER_DEFAULT, Region } from 'react-native-maps';

import { SelectedLocation } from './moving.types';

export interface MapWithRouteProps {
  startLocation: SelectedLocation | null;
  endLocation: SelectedLocation | null;
  routeCoordinates: LatLng[];
  initialRegion?: Region;
}

const androidMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#e5e5e5' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dadada' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#e5e5e5' }] },
  { featureType: 'transit.station', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9c9c9' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
];

const DEFAULT_REGION: Region = {
  latitude: 40.7128,
  longitude: -74.006,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

export const MapWithRoute = forwardRef<MapView, MapWithRouteProps>(
  ({ startLocation, endLocation, routeCoordinates, initialRegion }, ref) => {
    const region = useMemo(() => initialRegion ?? DEFAULT_REGION, [initialRegion]);

    return (
      <View style={styles.container}>
        <MapView
          ref={ref}
          style={styles.map}
          provider={PROVIDER_DEFAULT}
          initialRegion={region}
          showsUserLocation={false}
          showsMyLocationButton={false}
          loadingEnabled
          mapType="standard"
          userInterfaceStyle="light"
          customMapStyle={Platform.OS === 'android' ? androidMapStyle : undefined}
        >
          {startLocation && (
            <Marker
              coordinate={startLocation.coordinate}
              title="Start"

              description={startLocation.description}
              anchor={{ x: 0.5, y: 1 }}
              centerOffset={{ x: 0, y: -12 }}
              tracksViewChanges={false}
            >
              <Image
                source={require('../../../assets/icons/ConfirmLocationIcon.png')}
                style={styles.startIcon}
              />
            </Marker>
          )}
          {endLocation && (
            <Marker
              coordinate={endLocation.coordinate}
              title="End"
              description={endLocation.description}
              anchor={{ x: 0.3, y: 1 }}
              centerOffset={{ x: 0, y: -10 }}
              tracksViewChanges={false}
            >
              <Image
                source={require('../../../assets/icons/finish-flag.png')}
                style={styles.endIcon}
              />
            </Marker>
          )}
          {routeCoordinates.length > 1 && (
            <Polyline coordinates={routeCoordinates} strokeColor="#0c4309" strokeWidth={3} />
          )}
        </MapView>
      </View>
    );
  }
);

MapWithRoute.displayName = 'MapWithRoute';

const styles = StyleSheet.create({
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
  startIcon: {
    width: 30,
    height: 30,
    resizeMode: 'contain',
  },
  endIcon: {
    width: 26,
    height: 26,
    resizeMode: 'contain',
  },
});






