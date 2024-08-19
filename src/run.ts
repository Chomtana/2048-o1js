/**
 * This file specifies how to run the `TicTacToe` smart contract locally using the `Mina.LocalBlockchain()` method.
 * The `Mina.LocalBlockchain()` method specifies a ledger of accounts and contains logic for updating the ledger.
 *
 * Please note that this deployment is local and does not deploy to a live network.
 * If you wish to deploy to a live network, please use the zkapp-cli to deploy.
 *
 * To run locally:
 * Build the project: `$ npm run build`
 * Run with node:     `$ node build/src/run.js`.
 */

import {
  Field,
  PrivateKey,
  PublicKey,
  Mina,
  AccountUpdate,
  Signature,
} from 'o1js';
import { Game2048, Board } from './game2048.js';
import readline from 'readline-sync'

let Local = await Mina.LocalBlockchain({ proofsEnabled: false });
Mina.setActiveInstance(Local);
const [player] = Local.testAccounts;
const playerKey = player.key;
const zkAppPrivateKey = PrivateKey.random();
const zkAppPublicKey = zkAppPrivateKey.toPublicKey();
const zkApp = new Game2048(zkAppPublicKey);

// Create a new instance of the contract
console.log('\n\n====== DEPLOYING ======\n\n');
const txn = await Mina.transaction(player, async () => {
  AccountUpdate.fundNewAccount(player);
  await zkApp.deploy();
  await zkApp.startGame(player);
});
await txn.prove();
/**
 * note: this tx needs to be signed with `tx.sign()`, because `deploy` uses `requireSignature()` under the hood,
 * so one of the account updates in this tx has to be authorized with a signature (vs proof).
 * this is necessary for the deploy tx because the initial permissions for all account fields are "signature".
 * (but `deploy()` changes some of those permissions to "proof" and adds the verification key that enables proofs.
 * that's why we don't need `tx.sign()` for the later transactions.)
 */
await txn.sign([zkAppPrivateKey, playerKey]).send();

console.log('Game Deployed');

// initial state
console.log('\nInitial board');

await randomEmptyTile(player, playerKey)

let b = zkApp.board.get();
new Board(b).printState();

while (true) {
  const dir = readline.question('Move Direction (u/d/l/r): ')

  switch (dir) {
    case 'u':
      await makeMove(player, playerKey, 0)
      break

    case 'd':
      await makeMove(player, playerKey, 1)
      break

    case 'l':
      await makeMove(player, playerKey, 2)
      break

    case 'l':
      await makeMove(player, playerKey, 3)
      break
  }

  await randomEmptyTile(player, playerKey)
  let b = zkApp.board.get();
  new Board(b).printState();

  if (zkApp.gameDone.get()) {
    console.log('Game Over')
    break
  }
}

// // play
// console.log('\n\n====== FIRST MOVE ======\n\n');
// await makeMove(player1, player1Key, 0, 0);

// // debug
// b = zkApp.board.get();
// new Board(b).printState();

// // play
// console.log('\n\n====== SECOND MOVE ======\n\n');
// await makeMove(player2, player2Key, 1, 0);
// // debug
// b = zkApp.board.get();
// new Board(b).printState();

// // play
// console.log('\n\n====== THIRD MOVE ======\n\n');
// await makeMove(player1, player1Key, 1, 1);
// // debug
// b = zkApp.board.get();
// new Board(b).printState();

// // play
// console.log('\n\n====== FOURTH MOVE ======\n\n');
// await makeMove(player2, player2Key, 2, 1);

// // debug
// b = zkApp.board.get();
// new Board(b).printState();

// // play
// console.log('\n\n====== FIFTH MOVE ======\n\n');
// await makeMove(player1, player1Key, 2, 2);

// // debug
// b = zkApp.board.get();
// new Board(b).printState();

// let isNextPlayer2 = zkApp.nextIsPlayer2.get();

// console.log('did someone win?', isNextPlayer2 ? 'Player 1!' : 'Player 2!');
// // cleanup

async function randomEmptyTile(
  player: PublicKey,
  playerKey: PrivateKey,
) {
  let b = new Board(zkApp.board.get());
  const [r0, c0] = b.randomEmptyTile()

  if (r0 < 0 || c0 < 0) throw new Error('Game Over')

  const [r, c] = [Field(r0), Field(c0)]

  const index = r0 * 4 + c0

  const txn = await Mina.transaction(player, async () => {
    const signature = Signature.create(playerKey, [Field(2), Field(index)]);
    await zkApp.addTile(player, signature, r, c)
  })
  await txn.prove();
  await txn.sign([playerKey]).send();
}

async function makeMove(
  player: PublicKey,
  playerKey: PrivateKey,
  dir: number,
) {
  const txn = await Mina.transaction(player, async () => {
    const signature = Signature.create(playerKey, [Field(1), Field(dir)]);
    switch (dir) {
      case 0:
        await zkApp.moveUp(player, signature);
        break;

      case 1:
        await zkApp.moveDown(player, signature);
        break;

      case 2:
        await zkApp.moveLeft(player, signature);
        break;

      case 3:
        await zkApp.moveRight(player, signature);
        break;
    }
  });
  await txn.prove();
  await txn.sign([playerKey]).send();
}
