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

// Extract parameters from URL
const urlParams = new URLSearchParams(window.location.search);
const type = urlParams.get('type');
const sender = urlParams.get('sender');
const receiver = urlParams.get('receiver');
const name = urlParams.get('name');
const caller = urlParams.get('caller');

document.getElementById("receiver").innerHTML = receiver ? receiver : caller;

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);

const servers = {
    iceServers: [
        { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
    ],
    iceCandidatePoolSize: 10,
};

// Global State
const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = new MediaStream();

// HTML elements
const webcamVideo = document.getElementById('webcamVideo');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');
const toggleVideoButton = document.getElementById('toggleVideoButton');
const toggleAudioButton = document.getElementById('toggleAudioButton');
const changeSpeaker = document.getElementById('speaker');
const changeCamera = document.getElementById('rotatecamera');

// Default camera mode
let currentFacingMode = "user"; // "user" = front, "environment" = rear
let currentOutputDevice = "default"; // Default audio output

// Start the webcam
async function startWebcam() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: currentFacingMode }, audio: true });
        webcamVideo.srcObject = localStream;
        remoteVideo.srcObject = remoteStream;

        // Push tracks to peer connection
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

        // Pull tracks from remote stream
        pc.ontrack = (event) => {
            event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
        };
    } catch (error) {
        console.error("Error accessing camera/microphone:", error);
    }
}

// 1. Call Setup (Make a Call)
async function makeCall() {
    const callDocRef = doc(collection(firestore, 'calls'));
    const offerCandidatesRef = collection(callDocRef, 'offerCandidates');
    const answerCandidatesRef = collection(callDocRef, 'answerCandidates');

    console.log("Making a call...");

    pc.onicecandidate = (event) => {
        if (event.candidate) addDoc(offerCandidatesRef, event.candidate.toJSON());
    };

    const offerDescription = await pc.createOffer();
    await pc.setLocalDescription(offerDescription);

    await setDoc(callDocRef, { offer: { sdp: offerDescription.sdp, type: offerDescription.type } });
    await setDoc(doc(firestore, 'users', receiver), { callid: callDocRef.id }, { merge: true });

    onSnapshot(callDocRef, (snapshot) => {
        const data = snapshot.data();
        if (!pc.currentRemoteDescription && data?.answer) {
            pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
    });

    onSnapshot(answerCandidatesRef, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
        });
    });

    hangupButton.disabled = false;
}

// 2. Answer Call
async function answerCall() {
    const senderDocRef = doc(firestore, 'users', name);
    const senderDocSnap = await getDoc(senderDocRef);
    if (!senderDocSnap.exists()) {
        console.error("Sender document does not exist!");
        return;
    }

    const callId = senderDocSnap.data().callid;
    if (!callId) {
        console.error("No call ID found in sender's document!");
        return;
    }

    console.log("Answering call:", callId);
    const callDocRef = doc(firestore, 'calls', callId);
    const answerCandidatesRef = collection(callDocRef, 'answerCandidates');
    const offerCandidatesRef = collection(callDocRef, 'offerCandidates');

    pc.onicecandidate = (event) => {
        if (event.candidate) addDoc(answerCandidatesRef, event.candidate.toJSON());
    };

    const callData = (await getDoc(callDocRef)).data();
    await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));

    const answerDescription = await pc.createAnswer();
    await pc.setLocalDescription(answerDescription);

    await updateDoc(callDocRef, { answer: { type: answerDescription.type, sdp: answerDescription.sdp } });

    onSnapshot(offerCandidatesRef, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
        });
    });
}

// 3. Handle Call Type
if (type === "send") makeCall();
if (type === "receive") answerCall();

// 4. Toggle Video
toggleVideoButton.onclick = () => {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        toggleVideoButton.innerHTML = videoTrack.enabled ? '<i class="fa-solid fa-video-slash"></i>' : '<i class="fa-solid fa-video"></i>';
    }
};

// 5. Toggle Audio
toggleAudioButton.onclick = () => {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        toggleAudioButton.innerHTML = audioTrack.enabled ? '<i class="fa-solid fa-microphone-slash"></i>' : '<i class="fa-solid fa-microphone"></i>';
    }
};

// 6. Switch Camera (Front ↔ Rear)
changeCamera.onclick = async () => {
    currentFacingMode = currentFacingMode === "user" ? "environment" : "user";
    await startWebcam();
};

// 7. Switch Speaker (Earpiece ↔ Loudspeaker)
changeSpeaker.onclick = async () => {
    const audioElement = document.getElementById("remoteVideo");
    if (audioElement.setSinkId) {
        currentOutputDevice = currentOutputDevice === "default" ? "speaker" : "default";
        await audioElement.setSinkId(currentOutputDevice);
        console.log("Audio output switched to:", currentOutputDevice);
    } else {
        console.warn("setSinkId() is not supported in this browser.");
    }
};

// 8. Hang Up
hangupButton.onclick = () => {
    pc.close();
    localStream.getTracks().forEach(track => track.stop());
    hangupButton.disabled = true;
};

// Start the webcam when the page loads
startWebcam();
