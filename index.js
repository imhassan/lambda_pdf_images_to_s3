// dependencies
var AWS = require('aws-sdk');
var fs = require('fs');

var s3 = new AWS.S3();
var dstBucket = null;
var dstKey = null;
var srcFileKey = null;
var local_stored_pdf = null;

function upload_image(bucket, key, filename, content_type, cb) {
	s3.putObject({
		Bucket : bucket,
		Key : key,
		Body : fs.createReadStream(filename),
		ContentType : content_type
	}, function(err, data) {
		console.log(err);
		cb(err, data);
	});
}

function upload_images(context, total_images, cb) {
	console.log('images upload starts...');
	numCompleted = 1;

	for (var i = 1; i <= total_images; i++) {
		console.log(' image upload # ' + i);
		upload_image(dstBucket, dstKey + "/" + srcFilename + "_" + i, "images/" + i + ".jpg", "image/jpeg", function(err, data) {

			numCompleted++;
			if (numCompleted > total_images) {
				console.log("Done all calls!");
				cb();
			}

		});
	}
}

exports.handler = function(event, context) {
	// Read options from the event.
	var srcBucket = event.Records[0].s3.bucket.name;
	var srcKey = event.Records[0].s3.object.key;
	dstBucket = srcBucket;

	var srcFilenameArr = srcKey.split(".");
	srcFileKey = srcFilenameArr[0];
	var srcFileExt = srcFilenameArr[1].toLowerCase();

	srcFilename = srcFileKey.substring(srcFileKey.lastIndexOf('/') + 1);
	dstKey = srcFileKey.substring(0, (srcFileKey.lastIndexOf('/') > 0 ? srcFileKey.lastIndexOf('/') : srcFileKey.length));
	local_stored_pdf = "/tmp/" + srcFilename + ".pdf";

	console.log("PDF to Images and Uploading....");

	var validFileTypes = [ 'pdf' ];
	if (validFileTypes.indexOf(srcFileExt) < 0) {
		context.done(null, {
			status : false,
			message : 'File extension does not match.'
		});
	}

	// Download file from S3, transform, and upload its images again to bucket.

	s3.getObject({
		Bucket : srcBucket,
		Key : srcKey
	}, function(err, data) {
		if (err) {
			console.log(err);
			context.done(null, {
				status : false,
				message : 'Unable to download the file.'
			});
		} else {
			console.log('file downloaded...');
			fs.writeFile(local_stored_pdf, data.Body, {
				encoding : null
			}, function(fserr) {
				console.log("fserr: " + fserr)
				if (fserr) {
					// if there is problem just print to console and move on.
					context.done(null, {
						status : false,
						message : 'Unable to copy file into tmp directory.'
					});
				} else {
					console.log('File Downloaded! ' + data.ContentType);

					var exec = require('child_process').exec, child;
					child = exec('gs -sDEVICE=jpeg -dTextAlphaBits=4 -r300 -o images/%d.jpg ' + local_stored_pdf, function(error,
						stdout, stderr) {
						console.log('stdout: ' + stdout);
						console.log('stderr: ' + stderr);
						if (error !== null) {
							console.log('exec error: ' + error);
							context.done(null, {
								status : false,
								message : 'Error in creating images.'
							});
						} else {
							console.log('images created...');
							child = exec('gs -q  -dNODISPLAY  -c "(' + local_stored_pdf
								+ ') (r) file runpdfbegin pdfpagecount = quit"', function(error, stdout, stderr) {
								if (error !== null) {
									console.log('exec error: ' + error);
									context.done(null, {
										status : false,
										message : 'Error in getting pdf page count.'
									});
								} else {
									console.log('pages count:' + stdout);
									upload_images(context, stdout, function() {
										context.done(null, {
											status : true,
											message : 'PDF to images done successfully.'
										});
									});
								}
							});

						}
					});

				}
			});

		}
	});

};

// lambda-local -l index.js -h handler -e data/input.js -t 60
