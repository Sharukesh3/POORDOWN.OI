import { db, auth } from '../firebaseConfig';
import { 
    collection, 
    doc, 
    setDoc, 
    getDoc, 
    getDocs, 
    query, 
    where, 
    deleteDoc,
    serverTimestamp,
    Timestamp 
} from 'firebase/firestore';
import type { CustomBoardConfig } from '../CustomBoardTypes';

const STORAGE_KEY_GUEST_MAPS = 'monopoly_guest_maps';

// Firestore Collection Reference
const mapsCollection = collection(db, 'custom_maps');

export interface SavedMap extends CustomBoardConfig {
    ownerId: string;
    createdAt: number | any; // Timestamp or number
}

// === Guest Logic (LocalStorage) ===

export const getGuestMaps = (): SavedMap[] => {
    const json = localStorage.getItem(STORAGE_KEY_GUEST_MAPS);
    if (!json) return [];
    try {
        return JSON.parse(json);
    } catch {
        return [];
    }
};

export const saveGuestMap = (config: CustomBoardConfig): boolean => {
    const maps = getGuestMaps();
    
    // Limit check: Guests can only have 1 map
    if (maps.length >= 1) {
        // Check if we are updating the existing map
        const existingIndex = maps.findIndex(m => m.id === config.id);
        if (existingIndex === -1) {
             return false; // Limit reached, cannot create new
        }
    }

    const newMap: SavedMap = {
        ...config,
        ownerId: 'guest',
        createdAt: Date.now()
    };

    // Update or Append
    const existingIndex = maps.findIndex(m => m.id === config.id);
    if (existingIndex >= 0) {
        maps[existingIndex] = newMap;
    } else {
        maps.push(newMap);
    }

    localStorage.setItem(STORAGE_KEY_GUEST_MAPS, JSON.stringify(maps));
    return true;
};


// === User Logic (Firestore) ===

export const getUserMaps = async (userId: string): Promise<SavedMap[]> => {
    if (!userId) return [];
    
    const q = query(mapsCollection, where("ownerId", "==", userId));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => {
        const data = doc.data();
        // Convert Firestore Timestamp to number for client consistency if needed, 
        // but our types say 'number' for createdAt usually.
        // For now, we mix types or cast.
        return { 
            ...data, 
            id: doc.id // Ensure ID matches doc ID
        } as SavedMap;
    });
};

export const saveUserMap = async (userId: string, config: CustomBoardConfig): Promise<void> => {
    if (!userId) throw new Error("No user ID");

    const mapRef = doc(db, 'custom_maps', config.id);
    
    // We store the flattened config + metadata
    const mapData = {
        ...config,
        ownerId: userId,
        createdAt: serverTimestamp() // Use server time
    };

    await setDoc(mapRef, mapData);
};

export const deleteUserMap = async (mapId: string): Promise<void> => {
    const mapRef = doc(db, 'custom_maps', mapId);
    await deleteDoc(mapRef);
};
