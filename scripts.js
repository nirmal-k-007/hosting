// Import Firebase and Firestore functions from the Firebase CDN
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js';
import { getFirestore, doc, collection, setDoc, getDoc, getDocs, updateDoc, onSnapshot, addDoc } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js';

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDxj40CFZr27QmmlUaHCg4limwNyFg0g1A",
    authDomain: "webrtc-5c8c6.firebaseapp.com",
    projectId: "webrtc-5c8c6",
    storageBucket: "webrtc-5c8c6.firebasestorage.app",
    messagingSenderId: "698617111865",
    appId: "1:698617111865:web:3270db8691afe7f12c74e8",
    measurementId: "G-PXR951TSRB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);

const servers = {
    iceServers: [
        {
            urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
        },
    ],
    iceCandidatePoolSize: 10,
};

// Global State
const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

// HTML elements
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');

// 1. Setup media sources
webcamButton.onclick = async () => {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    remoteStream = new MediaStream();

    // Push tracks from local stream to peer connection
    localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
    });

    // Pull tracks from remote stream, add to video stream
    pc.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => {
            remoteStream.addTrack(track);
        });
    };

    webcamVideo.srcObject = localStream;
    remoteVideo.srcObject = remoteStream;

    callButton.disabled = false;
    answerButton.disabled = false;
    webcamButton.disabled = true;
};

// 2. Create an offer
callButton.onclick = async () => {
    // Reference Firestore collections for signaling
    const callDocRef = doc(collection(firestore, 'calls'));
    const offerCandidatesRef = collection(callDocRef, 'offerCandidates');
    const answerCandidatesRef = collection(callDocRef, 'answerCandidates');

    callInput.value = callDocRef.id;

    // Get candidates for caller, save to db
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            addDoc(offerCandidatesRef, event.candidate.toJSON());
        }
    };

    // Create offer
    const offerDescription = await pc.createOffer();
    await pc.setLocalDescription(offerDescription);

    const offer = {
        sdp: offerDescription.sdp,
        type: offerDescription.type,
    };

    await setDoc(callDocRef, { offer });

    // Listen for remote answer
    onSnapshot(callDocRef, (snapshot) => {
        const data = snapshot.data();
        if (!pc.currentRemoteDescription && data?.answer) {
            const answerDescription = new RTCSessionDescription(data.answer);
            pc.setRemoteDescription(answerDescription);
        }
    });

    // When answered, add candidate to peer connection
    onSnapshot(answerCandidatesRef, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                const candidate = new RTCIceCandidate(change.doc.data());
                pc.addIceCandidate(candidate);
            }
        });
    });

    hangupButton.disabled = false;
};

// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
    const callId = callInput.value;
    const callDocRef = doc(firestore, 'calls', callId);
    const answerCandidatesRef = collection(callDocRef, 'answerCandidates');
    const offerCandidatesRef = collection(callDocRef, 'offerCandidates');

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            addDoc(answerCandidatesRef, event.candidate.toJSON());
        }
    };

    const callData = (await getDoc(callDocRef)).data();

    const offerDescription = callData.offer;
    await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

    const answerDescription = await pc.createAnswer();
    await pc.setLocalDescription(answerDescription);

    const answer = {
        type: answerDescription.type,
        sdp: answerDescription.sdp,
    };

    await updateDoc(callDocRef, { answer });

    onSnapshot(offerCandidatesRef, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                let data = change.doc.data();
                pc.addIceCandidate(new RTCIceCandidate(data));
            }
        });
    });
};

// Hang up the call
hangupButton.onclick = () => {
    pc.close();
    webcamButton.disabled = false;
    callButton.disabled = true;
    answerButton.disabled = true;
    hangupButton.disabled = true;
    localStream.getTracks().forEach(track => track.stop());
};