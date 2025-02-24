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


const urlParams = new URLSearchParams(window.location.search);

const type = urlParams.get('type')

    const sender = urlParams.get('sender');
    const receiver = urlParams.get('receiver');
    const name = urlParams.get('name');
    const caller = urlParams.get('caller')
// document.getElementById("name").innerHTML = receiver 


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


// 2. Create an offer
async function makeCall () {
    // Reference Firestore collections for signaling
    const callDocRef = doc(collection(firestore, 'calls'));
    const offerCandidatesRef = collection(callDocRef, 'offerCandidates');
    const answerCandidatesRef = collection(callDocRef, 'answerCandidates');
    console.log("Clicked")
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

    const receiverDocRef = doc(firestore, 'users', receiver);
    await setDoc(receiverDocRef, { callid: callDocRef.id }, { merge: true });

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

if(type==="send"){
    makeCall();
}

// 3. Answer the call with the unique ID
async function answerCall () {

    const senderDocRef = doc(firestore, 'users', name);
    
    // Fetch the call ID from sender's document
    const senderDocSnap = await getDoc(senderDocRef);
    if (!senderDocSnap.exists()) {
        console.error("Sender document does not exist!");
        return;
    }

    const callId = senderDocSnap.data().callid; // Fetch call ID
    if (!callId) {
        console.error("No call ID found in sender's document!");
        return;
    }

    console.log(callId);

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

if(type==="receive"){
    answerCall()
}

// Hang up the call
hangupButton.onclick = () => {
    pc.close();
    webcamButton.disabled = false;
    callButton.disabled = true;
    answerButton.disabled = true;
    hangupButton.disabled = true;
    localStream.getTracks().forEach(track => track.stop());
};
