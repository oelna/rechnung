
import { QRCode } from 'https://oelna.github.io/qrcodejs/qrcode.esm.js';
import sortable from 'https://oelna.github.io/rechnung/html5sortable.es.js';
import { Draggable, Sortable, Droppable } from 'https://cdn.jsdelivr.net/npm/@shopify/draggable/build/esm/index.mjs';
// import interact from 'https://cdn.interactjs.io/v1.10.26/interactjs/index.js';

let currentPage = 1;
let defaultFactor = 1;
let activeFrame;
let activePage = 1;

// updating
let updateDelay = 1200;
let timeout;

const sizeMM = 3.779527559; // 1mm in px
const sizePX = 0.26458333333719; // 1px in mm

// barcode settings
const barcodeSettings = {
	'element': document.querySelector('#girocode'),
	'size': 128,
	'darkColor': '#000',
	'lightColor': 'transparent'
};

const signatureElement = document.querySelector('#signaturecode');

function recalculate () {
	const page = document.querySelector('#page-'+currentPage);
	const table = page.querySelector('table');
	const rows = table.querySelectorAll('tr');

	const dataRows = [...rows].slice(1, rows.length-3);

	const rate = parseFloat(table.querySelector('th.rate').textContent);
	const sumNet = table.querySelector('td.sum.net');
	const tax = table.querySelector('td.sum.tax');
	const grandTotal = table.querySelector('td.sum.grandtotal')

	let total = 0;

	for (const row of dataRows) {
		// calculate duration x factor x rate

		const cells = row.querySelectorAll('td');
		
		if (cells[1].textContent.trim() != '') {
			// with duration
			const duration = parseDuration(cells[1].textContent);
			const factor = (cells[2].textContent.trim() != '') ? parseFloat(cells[2].textContent) : 1;

			// console.log(duration, factor, rate);

			const calculatedSum = round(duration * factor * rate);
			cells[3].textContent = parseFloat(calculatedSum).toFixed(2);
			
			total += calculatedSum;
		} else {
			// no duration, leave sum alone
			total += parseFloat(cells[3].textContent);
		}
	}

	const t = round(total);

	const taxText = document.querySelector('.tax-text').textContent;
	const taxMatches = /Mwst?\s?([0-9]+)%/.exec(taxText);
	if (taxMatches[1]) { // get tax from text if possible
		tax.setAttribute('data-percent', taxMatches[1]);
	}
	const taxPercent = parseFloat(tax.getAttribute('data-percent'));

	const calculatedTax = t / 100 * taxPercent;

	sumNet.textContent = t.toFixed(2);
	tax.textContent = calculatedTax.toFixed(2);

	grandTotal.textContent = round(t + calculatedTax).toFixed(2);

	console.log('updated page', currentPage);
	updateBarcode();

	// Beleg^0.00_43.60_0.00_0.00_0.00^43.60:Bar
	// full string (0), "Beleg" (1), steuer allg (2), steuer erm (3), 10.7% (4), 5.5% (5), rest (6)
	// 5.5 = Forstwirtschaftliche Erzeugnisse
	// 10.7 = Erzeugnisse von Landwirten
	let belegStr;
	if (taxPercent == 7) {
		// reduced tax 7%
		belegStr = 'Beleg^0.00_'+grandTotal.textContent+'_0.00_0.00_0.00^'+grandTotal.textContent+':Bank';
	} else {
		// default 19%
		belegStr = 'Beleg^'+grandTotal.textContent+'_0.00_0.00_0.00_0.00^'+grandTotal.textContent+':Bank';
	}
	
	console.log(belegStr);
	document.querySelector('.footer .signed-string').textContent = belegStr;
	// updateSignature();
}

function round (input) {
	return Math.round((input + Number.EPSILON) * 100) / 100;
}

function parseDuration (durationString) {
	if (!durationString) return 0;

	// const matches = durationString.matchAll(/([0-9+]h)?\s?([0-9+]m)?/gi);

	var re = new RegExp(/([0-9]+h)?\s?([0-9]+m)?/, 'g');
	var matches = re.exec(durationString);
	// console.log(matches);
	const hours = matches[1] ? parseInt(matches[1]) : 0;
	const minutes = matches[2] ? parseInt(matches[2]) : 0;

	return (hours + minutes / 60);
}

async function updateBarcode () {
	// https://openiban.com/validate/DE64120300001050649340?getBIC=true

	const owner = document.querySelector('.owner').textContent.trim();
	const iban = document.querySelector('.iban').textContent.replaceAll(' ', '');
	const receipt = document.querySelector('.receipt-id').textContent.trim();
	const grandTotal = parseFloat(document.querySelector('td.sum.grandtotal').textContent);

	const response = await fetch('https://openiban.com/validate/'+iban+'?getBIC=true');
	const { bankData } = await response.json();

	if (!bankData.bic) {
		console.error('could not fetch BIC!');
	}

	// console.log(bankData.bic, owner, iban, receipt, grandTotal);
	const barcodeStr = giroCodeString({
		'bic': bankData.bic,
		'name': owner,
		'iban': iban,
		'currency': 'EUR',
		'amount': grandTotal,
		'reason': receipt
	});
	// console.log(barcodeStr);

	makeQR(barcodeSettings.element, barcodeStr);
}

function updateSignature () {

	const signatureEle = document.querySelector('.footer .signature');
	const publicKeyEle = document.querySelector('.footer .public-key');
	const signStrEle = document.querySelector('.footer .signed-string');

	const d = new Date();
	const receiptID = document.querySelector('.receipt-id').textContent;

	const barcode = [
		'V0', // version
		'ABC123', // ECR ID (RX30B5AW200084?)
		'Kassenbeleg-V1', // identifier
		signStrEle.textContent.trim(), // signed string?
		receiptID, // transaction
		'1', // signature count
		d.toISOString(), // start
		d.toISOString(), // end
		'ecdsa-plain-SHA384', // ecdsa type
		'unixTime', // time format
		publicKeyEle.textContent.trim(), // public key
		signatureEle.textContent.trim() // signature
	];

	const barcodeStr = barcode.join(';');
	console.log(barcodeStr);
	makeQR(signatureElement, barcodeStr);
}

function giroCodeString (params) {
	const sep = "\n";

	const data = {
		'service': 'BCD',
		'version': '001',
		'encoding': '2', // 1 = UTF-8, 2 = ISO 8859-1
		'transfer': 'SCT',
		'bic': params.bic.trim().toUpperCase(),
		'name': params.name.trim(),
		'iban': params.iban.replace(' ', '').trim(),
		'currency': params.currency.trim().toUpperCase(),
		'amount': params.amount, // is already a float
		'char': '',
		'ref': '',
		'reason': params.reason.trim().replace(sep, ' ').substring(0, 140), // max of 140 characters
		'hint': ''
	};

	let epcString = data.service;
	epcString += sep + data.version;
	epcString += sep + data.encoding;
	epcString += sep + data.transfer;
	epcString += sep + data.bic;
	epcString += sep + data.name;
	epcString += sep + data.iban;
	epcString += sep + data.currency + data.amount;
	epcString += sep + data.char;
	epcString += sep + data.ref;
	epcString += sep + data.reason;

	return epcString;
}

function makeQR (ele, str) {
	if (str.length > 0) {
		if (!QRCode) return false;

		const qr = new QRCode(ele, {
			width : barcodeSettings.size,
			height : barcodeSettings.size,
			colorDark : barcodeSettings.darkColor,
			colorLight : barcodeSettings.lightColor,
			correctLevel : QRCode.CorrectLevel.M,
			useSVG: true
		});

		qr.makeCode(str);
	}
}

// todo: multipage support?
document.addEventListener('keyup', function (event) {
	if (timeout) { clearTimeout(timeout); }
	timeout = setTimeout(recalculate, updateDelay);
});

document.querySelector('#add-row').addEventListener('click', function (event) {
	event.preventDefault();

	const page = document.querySelector('#page-'+currentPage);
	const table = page.querySelector('table');

	const rows = table.querySelectorAll('tr');

	rows[rows.length-4].insertAdjacentHTML(
		'afterend',
		'<tr><td>A</td><td>1h 0m</td><td></td><td class="sum">0.00</td><td class="handle"><svg><use href="#drag-handle"/></svg></td></tr>'
	);

	recalculate();
	if (sortable) { sortable('.page tbody'); } // reinit sortability
});

document.querySelector('#remove-row').addEventListener('click', function (event) {
	event.preventDefault();

	const page = document.querySelector('#page-'+currentPage);
	const table = page.querySelector('table');

	const rows = table.querySelectorAll('tr');

	if (rows.length > 5) {
		rows[rows.length-4].remove();

		recalculate();
		if (sortable) { sortable('.page tbody'); } // reinit sortability
	}
});

document.querySelector('#show-ecdsa').addEventListener('change', function (event) {
	event.preventDefault();

	document.querySelectorAll('#page-'+currentPage+' .footer .sig').forEach(function (ele, i) {
		ele.classList.toggle('hidden');
	});
});

document.querySelector('#show-girocode').addEventListener('change', function (event) {
	event.preventDefault();

	document.querySelectorAll('#page-'+currentPage+' .footer .giro').forEach(function (ele, i) {
		ele.classList.toggle('hidden');
	});
});

document.querySelector('#show-grid').addEventListener('change', function (event) {
	event.preventDefault();

	document.querySelector('.grids .document-grid').classList.toggle('hidden');
});

document.querySelector('#add-signature').addEventListener('click', async function (event) {
	event.preventDefault();

	const page = document.querySelector('#page-'+currentPage);
	const table = page.querySelector('table');

	const privateKeyPEM = document.querySelector('#private-key').value.trim() + "\n";

	if (!privateKeyPEM || privateKeyPEM.length < 1) {
		console.error('not a valid ECDSA pkcs#8 private key');
		return;
	}

	localStorage.setItem('rechnungPK', privateKeyPEM);

	let pk;
	try {
		pk = await importPrivateKey(privateKeyPEM);
	} catch (e) {
		console.warn('could not import private key');
		alert('Signing requires a valid private key!');
		return;
	}

	// sign
	const signatureEle = document.querySelector('.footer .signature');
	const publicKeyEle = document.querySelector('.footer .public-key');
	const signStrEle = document.querySelector('.footer .signed-string');

	const signature = await sign(signStrEle.textContent.trim(), pk);
	console.log(signStrEle.textContent.trim(), signature);

	const publicKey = await getPublicKey(pk);
	const pem = await exportPublicKey(publicKey);

	signatureEle.textContent = signature;
	publicKeyEle.textContent = stripPEM(pem);

	updateSignature();
});

async function sign (inputStr, privateKey) {
	const inputAB = new TextEncoder().encode(inputStr);

	var signatureAB = await window.crypto.subtle.sign({
		name: "ECDSA",
		hash: { name: "SHA-384" }
	}, privateKey, inputAB);

	return ab2b64(signatureAB);
}

function ab2b64 (arrayBuffer) {
	return window.btoa(String.fromCharCode.apply(null, new Uint8Array(arrayBuffer)));
}

function str2ab (str) {
	const buffer = new Uint8Array(str.length);
	for (let i = 0; i < str.length; i++) {
		buffer[i] = str.charCodeAt(i);
	}
	return buffer;
}

function ab2str (arrayBuffer) {
	return String.fromCharCode.apply(null, new Uint8Array(arrayBuffer));
}

async function exportPublicKey (key) {
	const exported = await window.crypto.subtle.exportKey('spki', key);
	const exportedAsString = ab2str(exported);
	const exportedAsBase64 = window.btoa(exportedAsString);
	const pemExported = `-----BEGIN PUBLIC KEY-----\n${exportedAsBase64}\n-----END PUBLIC KEY-----`;

	return pemExported;
}

async function exportPrivateKey (key) {
	const exported = await window.crypto.subtle.exportKey('pkcs8', key);
	const exportedAsString = ab2str(exported);
	const exportedAsBase64 = window.btoa(exportedAsString);
	const pemExported = `-----BEGIN PRIVATE KEY-----\n${exportedAsBase64}\n-----END PRIVATE KEY-----`;

	return pemExported;
}

async function getPublicKey (privateKey) {
	const jwkPrivate = await crypto.subtle.exportKey("jwk", privateKey);
	console.log(jwkPrivate);
	delete jwkPrivate.d;
	jwkPrivate.key_ops = ["verify"];
	return crypto.subtle.importKey("jwk", jwkPrivate, {name: "ECDSA", namedCurve: jwkPrivate.crv }, true, ["verify"]);
}

function stripPEM (pemStr) {
	/*
	const pemHeader = '-----BEGIN PRIVATE KEY-----';
	const pemFooter = '-----END PRIVATE KEY-----';

	const pemContents = pemStr.substring(
		pemHeader.length,
		pemStr.length - pemFooter.length - 1
	);
	*/
	const parts = pemStr.split('-----');
	if (parts.length < 5) {
		console.warn('not a valid PEM string');
		return false;
	}

	return parts[2].trim();
}

async function importPrivateKey (key) {

	const pemContents = stripPEM(key);
	console.log(pemContents);

	const binaryStr = window.atob(pemContents.trim());
	const buff = str2ab(binaryStr);

	const pk = await window.crypto.subtle.importKey(
		"pkcs8",
		buff,
		{
			name: "ECDSA",
			namedCurve: "P-521"
		},
		true,
		['sign']
	);

	return pk;
}



function exportMarkup (event) {
	event.preventDefault();
	
	const lang = document.documentElement.getAttribute('lang') || 'en';

	let html = "<!DOCTYPE html>\n<html lang=\""+lang+"\">\n" + document.documentElement.innerHTML + "\n</html>\n";
	const mimeType = 'text/html';

	if (event.target.getAttribute('data-editable') != 'true') {
		html = html.replaceAll(' contenteditable', '');
	}

	const link = document.createElement('a');
	link.setAttribute('download', 'document-download.html');
	link.setAttribute('href', 'data:' + mimeType  +  ';charset=utf-8,' + encodeURIComponent(html));
	link.click();
}

// file export
document.querySelector('#download-file').addEventListener('click', exportMarkup);
document.querySelector('#export-file').addEventListener('click', exportMarkup);

// sortable table rows
if (sortable) {
	sortable('.page tbody', {
		items: 'tr:not(.no-drag)',
		handle: '.handle',
		forcePlaceholderSize: true,
		// placeholder: '<tr><td colspan="7">&nbsp;</td></tr>'
	});
}

// focusable sections
document.addEventListener('click', function (event) {
	const frame = event.target.closest('section.frame');
	const page = event.target.closest('.page');
	
	if (page) {
		activePage = page;
	}

	if (frame) {
		activePage.querySelectorAll('section.frame[aria-current]').forEach(function (ele, i) {
			ele.removeAttribute('aria-current');
		});

		activeFrame = frame;
		frame.setAttribute('aria-current', '');

		displaySectionInfo(frame);
	} else {
		// deselect all
		document.querySelectorAll('section.frame[aria-current]').forEach(function (ele, i) {
			ele.removeAttribute('aria-current');
		});
	}
	// console.log(activeFrame, activePage);
});

function displaySectionInfo (section) {
	if (!section) return;
	// console.log('showing info on', section);
}

function drawGrid () {
	const ele = document.querySelector('.grids .document-grid');
	if (!ele) return;

	const color = '#ddd';
	const weight = 1; // px
	const size = 5; // mm

	const mode = 'grid'; // or lines

	let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="'+size+'mm" height="'+size+'mm">';
	if (mode == 'grid') svg += '<line x1="0" y1="0" x2="0" y2="100%" stroke="'+color+'" stroke-width="'+weight+'px" />';
	svg += '<line x1="0" y1="0" x2="100%" y2="0" stroke="'+color+'" stroke-width="'+weight+'px" />';
	svg += '</svg>';

	const css = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
	// ele.style.backgroundImage = 'url(' + css + ')';

	document.querySelector(':root').style.setProperty('--document-grid', 'url(' + css + ')');

	ele.style.setProperty('--document-grid-color', color);
	ele.style.setProperty('--document-grid-size', (size + 'mm'));
	ele.style.setProperty('--document-grid-weight', (weight + 'px'));
}

drawGrid();

let initialMousePosition;
let currentMousePosition;
let mouseOffset;

const draggable = new Draggable(document.querySelectorAll('.page .frames'), {
	draggable: 'section',
	delay: 300 // required so click events go through https://github.com/Shopify/draggable/issues/68
});

draggable.on('mirror:created', function (event) {
	// const containerRect = event.sourceContainer.getBoundingClientRect();
	const dragRect = event.source.getBoundingClientRect();

	mouseOffset = {
		x: (initialMousePosition.x - dragRect.x),
		y: (initialMousePosition.y - dragRect.y)
	};
});

draggable.on('drag:start', function (event) {
	// event.source.classList.add('dragging');

	initialMousePosition = {
		x: event.sensorEvent.clientX,
		y: event.sensorEvent.clientY,
	};
});

draggable.on('drag:move', function (event) {
	currentMousePosition = {
		x: event.sensorEvent.clientX,
		y: event.sensorEvent.clientY,
	};
});

draggable.on('drag:stop', function (event) {
	const item = event.originalSource;
	const page = event.sourceContainer.parentNode; // respect the .frames container
	const snapToGrid = true;

	item.style.position = 'absolute';

	let posX = (currentMousePosition.x - mouseOffset.x - page.offsetLeft + window.scrollX);
	let posY = (currentMousePosition.y - mouseOffset.y - page.offsetTop + window.scrollY);

	if (snapToGrid) {
		posX = roundTo(posX, 5*sizeMM);
		posY = roundTo(posY, 5*sizeMM);
	}

	item.style.top = 'calc(' +posY + 'px + 0px)'; // seems the conversion makes a slight offset
	item.style.left = 'calc(' +posX + 'px + 0px)';
});

function roundTo (input, roundTo) {
	return Math.round(input / roundTo) * roundTo;
};

// generate new ECDSA key
document.querySelector('#new-key')?.addEventListener('click', async function (event) {
	event.preventDefault();

	const newKey = await crypto.subtle.generateKey({
			"name": "ECDSA",
			"namedCurve": "P-521"
		},
		true,
		["sign", "verify"]
	);

	const exported = await exportPrivateKey(newKey.privateKey);

	if (await confirmDialog('Replace the current private key with the newly generated ECDSA key?')) {
		const ta = document.querySelector('#private-key');

		if (ta) {
			ta.value = exported.trim() + "\n";

			localStorage.setItem('rechnungPK', ta.value);
			recalculate();
		}
	}
});

function confirmDialog (msg) {
	return new Promise(function (resolve, reject) {
		let confirmed = window.confirm(msg);

		return confirmed ? resolve(true) : reject(false);
	});
}

// download the current private key
document.querySelector('#download-key')?.addEventListener('click', function (event) {
	event.preventDefault();

	const ta = document.querySelector('#private-key');

	if (ta) {
		const key = stripPEM(ta.value);

		const b64key = key.replace(/(.{64})/g, "$1\n");
		const pem = "-----BEGIN PRIVATE KEY-----\n"+b64key+"\n-----END PRIVATE KEY-----\n";

		const link = document.createElement('a');
		link.setAttribute('download', 'id_ecdsa_'+Date.now());
		link.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(pem));
		link.click();
	}
});

// restore some settings
if (localStorage.getItem('rechnungPK') !== null) {
	document.querySelector('#private-key').value = localStorage.getItem('rechnungPK');
}
