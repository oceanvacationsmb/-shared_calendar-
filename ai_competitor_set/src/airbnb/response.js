"use strict";

function extractDeferredState(html) {
  const match = String(html || "").match(
    /<script[^>]+id=["']data-deferred-state-0["'][^>]*>([\s\S]*?)<\/script>/i
  );

  if (!match) {
    throw new Error("Airbnb deferred JSON was not present in the response");
  }

  return JSON.parse(match[1]);
}

function getOperationPayload(deferredState, operationName) {
  const operations = deferredState?.niobeClientData;

  if (!Array.isArray(operations)) {
    throw new Error("Airbnb response does not contain niobeClientData");
  }

  const operation = operations.find(([key]) =>
    String(key || "").startsWith(`${operationName}:`)
  );

  if (!operation?.[1]?.data) {
    throw new Error(`Airbnb operation ${operationName} was not found`);
  }

  return operation[1];
}

function decodeRelayId(value) {
  if (!value) return null;

  try {
    const decoded = Buffer.from(String(value), "base64").toString("utf8");
    const separator = decoded.lastIndexOf(":");
    return separator >= 0 ? decoded.slice(separator + 1) : decoded;
  } catch (_) {
    return null;
  }
}

module.exports = {
  decodeRelayId,
  extractDeferredState,
  getOperationPayload
};
